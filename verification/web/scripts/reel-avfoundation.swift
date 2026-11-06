// AVFoundation only reads or writes compressed video samples here. Chromium
// decodes, composes and encodes the edited picture.
import AVFoundation
import Foundation

struct VideoSamples: Codable {
    struct Sample: Codable {
        let pts: Int64
        let duration: Int64
        let key: Bool
        let bytes: Data
    }
    let width: Int
    let height: Int
    let fps: Int
    let durationMs: Int
    let audioTracks: Int
    let avc: Data
    let samples: [Sample]
}

enum ReelError: Error { case unsupportedAsset, invalidSamples, io, badArguments }

@main struct ReelMedia {
    static func microseconds(_ time: CMTime) -> Int64 {
        CMTimeConvertScale(time, timescale: 1_000_000, method: .roundHalfAwayFromZero).value
    }

    static func read(_ path: String) async throws -> VideoSamples {
        let asset = AVURLAsset(url: URL(fileURLWithPath: path))
        let tracks = try await asset.loadTracks(withMediaType: .video)
        guard tracks.count == 1 else { throw ReelError.unsupportedAsset }
        let track = tracks[0]
        let descriptions = try await track.load(.formatDescriptions)
        let duration = try await track.load(.timeRange).duration
        let size = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let rate = try await track.load(.nominalFrameRate)
        let audio = try await asset.loadTracks(withMediaType: .audio)
        guard descriptions.count == 1, transform.isIdentity, [25, 30].contains(rate),
              CMFormatDescriptionGetMediaSubType(descriptions[0]) == kCMVideoCodecType_H264,
              let atoms = (CMFormatDescriptionGetExtensions(descriptions[0]) as NSDictionary?)?["SampleDescriptionExtensionAtoms"] as? [String: Data],
              let avc = atoms["avcC"] else { throw ReelError.unsupportedAsset }
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
        guard reader.canAdd(output) else { throw ReelError.unsupportedAsset }
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? ReelError.io }
        var samples: [VideoSamples.Sample] = []
        while let sample = output.copyNextSampleBuffer() {
            if CMSampleBufferGetNumSamples(sample) == 0 { continue }
            guard CMSampleBufferGetNumSamples(sample) == 1, let block = CMSampleBufferGetDataBuffer(sample) else {
                throw ReelError.invalidSamples
            }
            let length = CMBlockBufferGetDataLength(block)
            guard length > 0 && length <= 1_000_000 && samples.count < 3_000 else { throw ReelError.invalidSamples }
            var bytes = Data(count: length)
            let status = bytes.withUnsafeMutableBytes {
                CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: $0.baseAddress!)
            }
            guard status == noErr else { throw ReelError.io }
            let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[String: Any]]
            let nonSync = attachments?.first?[kCMSampleAttachmentKey_NotSync as String] as? Bool ?? false
            samples.append(.init(pts: microseconds(CMSampleBufferGetPresentationTimeStamp(sample)),
                duration: microseconds(CMSampleBufferGetDuration(sample)), key: !nonSync, bytes: bytes))
        }
        guard reader.status == .completed, samples.first?.key == true else { throw reader.error ?? ReelError.io }
        return .init(width: Int(size.width), height: Int(size.height), fps: Int(rate),
            durationMs: Int(microseconds(duration) / 1000), audioTracks: audio.count, avc: avc, samples: samples)
    }

    static func write(_ video: VideoSamples, to path: String) async throws {
        guard video.audioTracks == 0, video.fps == 25, video.width == 720, video.height == 1280,
              video.samples.first?.key == true, video.samples.count * 40 == video.durationMs else { throw ReelError.invalidSamples }
        var description: CMVideoFormatDescription?
        let extensions = ["SampleDescriptionExtensionAtoms": ["avcC": video.avc]]
        let formatResult = CMVideoFormatDescriptionCreate(allocator: kCFAllocatorDefault, codecType: kCMVideoCodecType_H264,
            width: Int32(video.width), height: Int32(video.height), extensions: extensions as CFDictionary,
            formatDescriptionOut: &description)
        guard formatResult == noErr, let description else { throw ReelError.unsupportedAsset }
        let writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: path), fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: description)
        guard writer.canAdd(input) else { throw ReelError.unsupportedAsset }
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? ReelError.io }
        writer.startSession(atSourceTime: .zero)
        do {
            for (index, frame) in video.samples.enumerated() {
                guard frame.pts == Int64(index * 40_000), frame.duration == 40_000, !frame.bytes.isEmpty else {
                    throw ReelError.invalidSamples
                }
                let limit = ContinuousClock.now + .seconds(5)
                while !input.isReadyForMoreMediaData {
                    guard writer.status == .writing, ContinuousClock.now < limit else { throw writer.error ?? ReelError.io }
                    try await Task.sleep(for: .milliseconds(4))
                }
                let length = frame.bytes.count
                var buffer: CMBlockBuffer?
                guard CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: length,
                    blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0, dataLength: length,
                    flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &buffer) == noErr, let buffer else { throw ReelError.io }
                let copied = frame.bytes.withUnsafeBytes {
                    CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: buffer, offsetIntoDestination: 0, dataLength: length)
                }
                guard copied == noErr else { throw ReelError.io }
                var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 25),
                    presentationTimeStamp: CMTime(value: Int64(index), timescale: 25), decodeTimeStamp: .invalid)
                var sampleSize = length
                var sample: CMSampleBuffer?
                guard CMSampleBufferCreateReady(allocator: kCFAllocatorDefault, dataBuffer: buffer, formatDescription: description,
                    sampleCount: 1, sampleTimingEntryCount: 1, sampleTimingArray: &timing,
                    sampleSizeEntryCount: 1, sampleSizeArray: &sampleSize, sampleBufferOut: &sample) == noErr,
                    let sample else { throw ReelError.io }
                if !frame.key, let array = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: true) {
                    let entry = unsafeBitCast(CFArrayGetValueAtIndex(array, 0), to: CFMutableDictionary.self)
                    CFDictionarySetValue(entry, Unmanaged.passUnretained(kCMSampleAttachmentKey_NotSync).toOpaque(),
                        Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
                }
                guard input.append(sample) else { throw writer.error ?? ReelError.io }
            }
            writer.endSession(atSourceTime: CMTime(value: Int64(video.samples.count), timescale: 25))
            input.markAsFinished()
            await writer.finishWriting()
            guard writer.status == .completed else { throw writer.error ?? ReelError.io }
        } catch { writer.cancelWriting(); throw error }
    }

    static func main() async throws {
        let args = CommandLine.arguments
        guard args.count == 4, !FileManager.default.fileExists(atPath: args[3]) else { throw ReelError.badArguments }
        if args[1] == "read" {
            let payload = try await read(args[2])
            try JSONEncoder().encode(payload).write(to: URL(fileURLWithPath: args[3]), options: .withoutOverwriting)
            print("Read \(payload.samples.count) compressed video samples")
        } else if args[1] == "write" {
            let payload = try JSONDecoder().decode(VideoSamples.self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
            try await write(payload, to: args[3])
        } else { throw ReelError.badArguments }
    }
}
