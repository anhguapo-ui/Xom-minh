package app.cardash.launcher

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock

/** Vị trí, tốc độ GPS và số liệu chuyến đi (thời gian chạy, quãng đường). */
class LocationHub(private val ctx: Context, private val onUpdate: () -> Unit) {
    private val manager = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var running = false
    private var previous: Location? = null
    private var lastGpsAt = 0L

    var last: Location? = null
        private set
    var speedKmh = 0f
        private set
    var tripMeters = 0.0
        private set
    var movingMs = 0L
        private set

    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) = accept(location)

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {
        }

        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }

    fun hasPermission(): Boolean =
        ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun start() {
        if (running || !hasPermission()) return
        try {
            val providers = manager.allProviders
            for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
                if (p !in providers) continue
                manager.requestLocationUpdates(p, 1000L, 0f, listener, Looper.getMainLooper())
                if (last == null) last = manager.getLastKnownLocation(p)
            }
            running = true
        } catch (e: SecurityException) {
            // Chưa có quyền: bỏ qua, giao diện sẽ nhắc người dùng.
        } catch (e: IllegalArgumentException) {
            // Máy không có nguồn định vị này.
        }
        onUpdate()
    }

    fun stop() {
        if (!running) return
        manager.removeUpdates(listener)
        running = false
        previous = null
        speedKmh = 0f
    }

    fun resetTrip() {
        tripMeters = 0.0
        movingMs = 0L
        onUpdate()
    }

    private fun accept(loc: Location) {
        val now = SystemClock.elapsedRealtime()
        val gps = loc.provider == LocationManager.GPS_PROVIDER
        if (gps) lastGpsAt = now
        // Đang có GPS thì bỏ qua vị trí mạng (kém chính xác hơn).
        else if (now - lastGpsAt < 10_000) return

        last = loc
        val kmh = if (loc.hasSpeed()) loc.speed * 3.6f else 0f
        speedKmh = if (kmh < 2f) 0f else kmh

        val prev = previous
        if (gps && prev != null && kmh >= 3f && loc.accuracy < 30f) {
            val meters = prev.distanceTo(loc)
            val ms = (loc.elapsedRealtimeNanos - prev.elapsedRealtimeNanos) / 1_000_000
            if (ms in 1..5000 && meters < 200f) {
                tripMeters += meters
                movingMs += ms
            }
        }
        if (gps) previous = loc
        onUpdate()
    }
}
