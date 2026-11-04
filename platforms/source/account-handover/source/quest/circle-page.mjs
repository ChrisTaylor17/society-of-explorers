import {mountCirclePage} from './circle-view.mjs';
// The available prototype has no verified member-session owner. Application
// integration can import mountCirclePage and pass its existing owner explicitly.
// No fixture authority or credential discovered from globals is adopted.
mountCirclePage({window,document});
