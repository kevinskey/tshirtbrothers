// APNs registration for the iOS app. No-op on the web — the plugin is
// imported dynamically so it never lands in the web bundle's hot path.
//
// Called on app boot (main.tsx) and right after login (AuthPage): boot
// covers returning sessions, login covers the first one. The permission
// prompt only appears for signed-in users on a real device; Safari and
// logged-out visitors never see it. The device token goes to
// POST /api/push/register (the nativeApi shim points it at production).

export async function initPushRegistration(): Promise<void> {
  if (window.location.protocol !== 'capacitor:') return;
  if (!localStorage.getItem('tsb_token')) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let status = (await PushNotifications.checkPermissions()).receive;
    if (status === 'prompt' || status === 'prompt-with-rationale') {
      status = (await PushNotifications.requestPermissions()).receive;
    }
    if (status !== 'granted') return;

    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', ({ value }) => {
      const auth = localStorage.getItem('tsb_token');
      if (!auth) return;
      void fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
        body: JSON.stringify({ token: value, platform: 'ios' }),
      }).catch(() => undefined);
    });
    await PushNotifications.addListener('registrationError', (e) => {
      console.error('[push] registration error:', JSON.stringify(e));
    });

    await PushNotifications.register();
  } catch (e) {
    console.error('[push] init failed:', e instanceof Error ? e.message : e);
  }
}
