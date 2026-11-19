import { registerRootComponent } from "expo";
import { createElement } from "react";

import App from "./App";

// Expo supplies InitialProps; the app resolves its trusted native configuration internally.
registerRootComponent(function RegisteredSoeApp() { return createElement(App); });
