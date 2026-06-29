export function getDisabledGeofence() {
  return {
    true: true,        // always allow UI
    0: 0,       // no distance logic
    disabled: true,
  };
}
