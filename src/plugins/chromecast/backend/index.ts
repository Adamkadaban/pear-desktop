import { getCastController } from './controller';

import type { BackendContext } from '@/types/contexts';
import type { ChromecastPluginConfig } from '../types';

// NOTE: exported as plain functions (no top-level `createBackend(...)` call) so
// this module stays side-effect-free. That lets the renderer build drop the
// unused import, keeping the electron-importing backend chain out of the
// renderer bundle (otherwise the renderer crashes on `import ... from 'electron'`).

export const onBackendStart = async ({
  getConfig,
  setConfig,
  ipc,
}: BackendContext<ChromecastPluginConfig>) => {
  const config = await getConfig();
  const castController = getCastController();

  // IPC surface for the renderer cast button / device picker.
  ipc.handle('chromecast:get-devices', () => castController.listDevices());
  ipc.handle('chromecast:get-active', () => castController.activeDeviceId);
  ipc.handle('chromecast:connect', (id: string) =>
    castController.connectTo(id),
  );
  ipc.handle('chromecast:disconnect', () => castController.disconnect());
  ipc.handle('chromecast:refresh', () => castController.refreshDevices());

  // The YTM volume slider drives the speaker volume while casting.
  ipc.on('chromecast:set-volume', (level: number) =>
    castController.setDeviceVolume(level),
  );

  // The renderer tells us when an ad is on the local player so we can suppress
  // mirroring (belt-and-suspenders alongside the adblocker plugin).
  ipc.on('chromecast:ad-state', (showing: boolean) =>
    castController.setAdShowing(showing),
  );

  // Push live updates so the button stays in sync.
  castController.onDevices((devices) =>
    ipc.send('chromecast:devices-changed', devices),
  );
  castController.onState((activeId) =>
    ipc.send('chromecast:state-changed', activeId),
  );

  await castController.start(config, (partial) => {
    Promise.resolve(setConfig(partial)).catch(console.error);
  });
};

export const onBackendStop = () => {
  getCastController().stop();
};

export const onBackendConfigChange = (newConfig: ChromecastPluginConfig) => {
  getCastController().updateConfig(newConfig);
};
