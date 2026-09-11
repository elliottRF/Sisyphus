package expo.modules.elliottrandroidtimer

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import java.util.Timer
import java.util.TimerTask
import kotlin.math.ceil
import kotlin.math.max

/**
 * The rest timer, as a foreground service so it survives the app being
 * backgrounded, killed from recents, or the screen locking.
 *
 * The deadline is the truth. `endTimeMs` is an absolute wall-clock time and
 * everything -- the tick, the notification, the value JS polls -- is derived
 * from it. An earlier version counted a `remaining--` down on its own, which
 * drifted away from the clock whenever the tick was delayed, so the
 * notification's chronometer (which IS clock-based) and the app disagreed, and
 * the finish alert landed late.
 */
class TimerService : Service() {

    private var timer: Timer? = null
    private var totalSeconds = 0
    private var isMuted = false
    private var endTimeMs = 0L
    private var nextName: String? = null
    private var nextLoad: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    /** Seconds left, from the clock, never negative. */
    private fun remaining(): Int {
        if (endTimeMs == 0L) return 0
        val ms = endTimeMs - System.currentTimeMillis()
        return max(0, ceil(ms / 1000.0).toInt())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "start" -> {
                val seconds = intent.getIntExtra("seconds", 0)
                // A zero-length timer is a stop. The app used to ask for one to
                // clear the stored value, which started a foreground service
                // just to tear it down -- and if the stop that followed lost the
                // race, the first tick found no time left and played the finish
                // alert, dinging at someone who had just cancelled.
                if (seconds <= 0) {
                    shutDown(alert = false)
                    return START_NOT_STICKY
                }
                totalSeconds = seconds
                isMuted = intent.getBooleanExtra("muted", false)
                nextName = intent.getStringExtra("nextName")?.takeIf { it.isNotBlank() }
                nextLoad = intent.getStringExtra("nextLoad")?.takeIf { it.isNotBlank() }
                endTimeMs = System.currentTimeMillis() + seconds * 1000L
                persistRemaining()
                startForegroundCompat()
                startTicking()
            }
            "adjust" -> {
                val delta = intent.getIntExtra("delta", 0)
                val next = max(5, remaining() + delta)
                if (next > totalSeconds) totalSeconds = next
                endTimeMs = System.currentTimeMillis() + next * 1000L
                persistRemaining()
                notifyUpdate()
            }
            "stop" -> {
                shutDown(alert = false)
            }
            else -> {
                // START_STICKY restart with no intent. Only worth re-posting if
                // there is still time on the clock; otherwise the service has
                // nothing to show.
                if (remaining() > 0) startForegroundCompat() else shutDown(alert = false)
            }
        }
        return START_STICKY
    }

    // -------------------------------------------------------------------------
    // Foreground
    // -------------------------------------------------------------------------

    private fun startForegroundCompat() {
        val notification = buildNotification(remaining())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    // -------------------------------------------------------------------------
    // Ticking
    // -------------------------------------------------------------------------

    private fun startTicking() {
        timer?.cancel()
        timer = Timer()
        timer?.scheduleAtFixedRate(object : TimerTask() {
            override fun run() {
                if (remaining() <= 0) {
                    shutDown(alert = true)
                } else {
                    persistRemaining()
                    notifyUpdate()
                }
            }
        }, 1000L, 1000L)
    }

    /**
     * The one way out. Writes 0 so the JS poll sees the stop, plays the finish
     * alert only when the clock actually ran out, and tears the service down.
     */
    private fun shutDown(alert: Boolean) {
        timer?.cancel()
        timer = null
        endTimeMs = 0L
        nextName = null
        nextLoad = null
        persistRemaining()
        if (alert) playAlert()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun notifyUpdate() {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification(remaining()))
    }

    override fun onDestroy() {
        timer?.cancel()
        timer = null
        super.onDestroy()
    }

    // -------------------------------------------------------------------------
    // Notification
    // -------------------------------------------------------------------------

    private fun buildNotification(seconds: Int): Notification {
        val launchPi = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val minusPi = pendingServiceIntent(REQUEST_MINUS, "adjust", "delta" to -30)
        val plusPi  = pendingServiceIntent(REQUEST_PLUS,  "adjust", "delta" to  30)
        val stopPi  = pendingServiceIntent(REQUEST_STOP,  "stop")

        val safe = max(seconds, 0)

        // What you are resting FOR is the useful line, so it is the headline and
        // it does not change every second.
        //
        // The name and the load go on SEPARATE lines. Android 16 renders a
        // promoted ongoing notification with the countdown on the title line,
        // so a long exercise name plus the numbers plus the clock did not fit
        // and the numbers -- the part you cannot infer -- fell off the end.
        //
        // The time is the chronometer's job and ONLY the chronometer's: the
        // system renders it live, including in the status bar chip, whereas a
        // copy in the text is redrawn once a second from a different rounding
        // and the header ended up reading "2:55 left" next to "02:53".
        val title = nextName ?: "Rest timer"
        val body = nextLoad
            ?: if (nextName != null) "Up next" else "Resting"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            // Ships with this module rather than the app, so it is a plain R
            // reference the compiler checks -- and it survives a prebuild, which
            // regenerates the app's res. A stopwatch rather than the app mark:
            // in a status bar full of icons, what it IS beats whose it is.
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            // Live Update (Android 16+): promoted chip in the status bar.
            .addExtras(android.os.Bundle().apply {
                putBoolean("android.requestPromotedOngoing", true)
            })
            // How far through the rest you are, at a glance.
            .setProgress(max(totalSeconds, 1), max(totalSeconds - safe, 0), false)
            // Chronometer countdown -- the system renders the live time itself,
            // including in the promoted chip.
            .setWhen(endTimeMs)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, "−30s", minusPi)
            .addAction(0, "Stop",  stopPi)
            .addAction(0, "+30s", plusPi)
            .setContentIntent(launchPi)
            .build()
    }

    /** Builds a PendingIntent that re-starts this service with a given action + optional int extra. */
    private fun pendingServiceIntent(
        requestCode: Int,
        action: String,
        vararg extras: Pair<String, Int>
    ): PendingIntent {
        val intent = Intent(this, TimerService::class.java).apply {
            this.action = action
            extras.forEach { (k, v) -> putExtra(k, v) }
        }
        return PendingIntent.getService(
            this, requestCode, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Rest timer", NotificationManager.IMPORTANCE_DEFAULT)
            channel.description = "The countdown between sets"
            channel.enableVibration(false)
            channel.setSound(null, null)
            channel.setShowBadge(false)
            channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun persistRemaining() {
        getSharedPreferences("timer", MODE_PRIVATE)
            .edit()
            .putInt("remaining", remaining())
            .apply()
    }

    private fun formatTime(seconds: Int): String {
        val m = seconds / 60
        val s = seconds % 60
        return "%d:%02d".format(m, s)
    }

    private fun playAlert() {
        if (isMuted) return
        try {
            @Suppress("DEPRECATION")
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                vibrator.vibrate(500)
            }

            val mp = MediaPlayer.create(applicationContext, R.raw.dingnoti)
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            mp.setOnCompletionListener { it.release() }
            mp.start()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    companion object {
        private const val NOTIF_ID    = 1
        private const val CHANNEL_ID  = "timer_v4"
        private const val REQUEST_MINUS = 1
        private const val REQUEST_PLUS  = 2
        private const val REQUEST_STOP  = 3
    }
}
