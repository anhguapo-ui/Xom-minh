package app.cardash.launcher

import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.view.KeyEvent

/** Dịch vụ rỗng: chỉ cần tồn tại để hệ thống cho phép đọc phiên phát nhạc. */
class MediaListener : NotificationListenerService()

/** Theo dõi bài đang phát và gửi lệnh lùi / phát / tới. */
class MediaCenter(private val ctx: Context, private val onChange: () -> Unit) {
    private val manager = ctx.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
    private val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val component = ComponentName(ctx, MediaListener::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private var listening = false

    var controller: MediaController? = null
        private set

    private val callback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = onChange()
        override fun onPlaybackStateChanged(state: PlaybackState?) = onChange()
        override fun onSessionDestroyed() = refresh()
    }

    private val sessionsListener =
        MediaSessionManager.OnActiveSessionsChangedListener { list -> pick(list) }

    fun hasAccess(): Boolean {
        val flat = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners")
            ?: return false
        return flat.split(':').any {
            ComponentName.unflattenFromString(it)?.packageName == ctx.packageName
        }
    }

    fun start() {
        if (!hasAccess()) {
            use(null)
            return
        }
        try {
            if (!listening) {
                manager.addOnActiveSessionsChangedListener(sessionsListener, component, handler)
                listening = true
            }
            pick(manager.getActiveSessions(component))
        } catch (e: SecurityException) {
            use(null)
        }
    }

    fun stop() {
        if (listening) {
            manager.removeOnActiveSessionsChangedListener(sessionsListener)
            listening = false
        }
        controller?.unregisterCallback(callback)
        controller = null
    }

    private fun refresh() {
        try {
            pick(if (hasAccess()) manager.getActiveSessions(component) else null)
        } catch (e: SecurityException) {
            use(null)
        }
    }

    private fun pick(list: List<MediaController>?) {
        val best = list?.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING }
            ?: list?.firstOrNull()
        use(best)
    }

    private fun use(next: MediaController?) {
        if (controller?.sessionToken != next?.sessionToken || next == null) {
            controller?.unregisterCallback(callback)
            controller = next
            next?.registerCallback(callback, handler)
        }
        onChange()
    }

    val title: String?
        get() = controller?.metadata?.let {
            it.getString(MediaMetadata.METADATA_KEY_TITLE)
                ?: it.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
        }

    val artist: String?
        get() = controller?.metadata?.let {
            it.getString(MediaMetadata.METADATA_KEY_ARTIST)
                ?: it.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
                ?: it.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE)
        }

    val art: Bitmap?
        get() = controller?.metadata?.let {
            it.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
                ?: it.getBitmap(MediaMetadata.METADATA_KEY_ART)
                ?: it.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON)
        }

    val isPlaying: Boolean
        get() = controller?.playbackState?.state == PlaybackState.STATE_PLAYING

    fun playPause() {
        val c = controller
        if (c == null) key(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
        else if (isPlaying) c.transportControls.pause()
        else c.transportControls.play()
    }

    fun next() = controller?.transportControls?.skipToNext() ?: key(KeyEvent.KEYCODE_MEDIA_NEXT)

    fun previous() =
        controller?.transportControls?.skipToPrevious() ?: key(KeyEvent.KEYCODE_MEDIA_PREVIOUS)

    /** Không có quyền đọc phiên phát thì vẫn bấm được nhờ phím media của hệ thống. */
    private fun key(code: Int) {
        audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
        audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
    }
}
