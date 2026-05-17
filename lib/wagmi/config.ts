import { createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { injected, coinbaseWallet } from '@wagmi/connectors'
import { getLiveBaseChainConfigs } from '@/lib/blockchain/liveBaseProfile'

const liveBaseChainConfigs = getLiveBaseChainConfigs()

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'Society of Explorers' }),
  ],
  transports: {
    [baseSepolia.id]: http(liveBaseChainConfigs[baseSepolia.id].rpcUrls[0]),
    [base.id]: http(liveBaseChainConfigs[base.id].rpcUrls[0]),
  },
})
