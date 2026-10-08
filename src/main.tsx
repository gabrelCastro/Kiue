import { render } from 'preact';
import { Controller } from './game/controller';
import { App } from './ui/App';
import { ControllerContext } from './ui/hooks';
import './styles.css';

const ctrl = new Controller();

render(
  <ControllerContext.Provider value={ctrl}>
    <App />
  </ControllerContext.Provider>,
  document.getElementById('app')!,
);
