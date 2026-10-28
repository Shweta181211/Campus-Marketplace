/** Ask the browser for the current position (rejects with a readable message). */
export function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser does not support location'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? 'Location permission denied' : 'Could not get your location')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  })
}

/** Cloudinary URLs can be resized on the fly; other URLs are returned unchanged. */
export function thumb(url, width = 400) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url
  return url.replace('/upload/', `/upload/c_fill,w_${width},h_${width},q_auto,f_auto/`)
}
