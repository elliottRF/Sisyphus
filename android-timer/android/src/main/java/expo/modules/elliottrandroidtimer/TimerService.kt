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

class TimerService : Service() {

    private var timer: Timer? = null
    private var remaining = 0
    private var totalSeconds = 0
    private var isMuted = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "start" -> {
                remaining = intent.getIntExtra("seconds", 0)
                totalSeconds = remaining
                isMuted = intent.getBooleanExtra("muted", false)
                persistRemaining()
                startForegroundCompat()
                startTicking()
            }
            "adjust" -> {
                val delta = intent.getIntExtra("delta", 0)
                remaining = maxOf(5, remaining + delta)
                // If time was added beyond the original total, grow the bar too
                if (remaining > totalSeconds) totalSeconds = remaining
                persistRemaining()
                notifyUpdate()
            }
            "stop" -> {
                // Write 0 so JS polling detects the stop
                getSharedPreferences("timer", MODE_PRIVATE)
                    .edit()
                    .putInt("remaining", 0)
                    .apply()
                stopForeground(true)
                stopSelf()
            }
            else -> {
                // START_STICKY restart with no intent — just re-post notification
                startForegroundCompat()
            }
        }
        return START_STICKY
    }

    // -------------------------------------------------------------------------
    // Foreground
    // -------------------------------------------------------------------------

    private fun startForegroundCompat() {
        val notification = buildNotification(remaining)
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
                remaining--
                persistRemaining()
                if (remaining <= 0) {
                    playAlert()
                    stopForeground(true)
                    stopSelf()
                } else {
                    notifyUpdate()
                }
            }
        }, 1000L, 1000L)
    }

    private fun notifyUpdate() {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification(remaining))
    }

    override fun onDestroy() {
        timer?.cancel()
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

        val safe = maxOf(seconds, 0)
        val progress = if (totalSeconds > 0) safe else 0

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Rest Timer")
            .setContentText(formatTime(safe))
            .setSubText("Tap to open Sisyphus")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setOngoing(true)
            .setOnlyAlertOnce(true)       // no sound/vibration on every tick
            .setShowWhen(false)
            .setProgress(totalSeconds, progress, false)
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
            val channel = NotificationChannel(CHANNEL_ID, "Timer", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Rest timer countdown"
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun persistRemaining() {
        getSharedPreferences("timer", MODE_PRIVATE)
            .edit()
            .putInt("remaining", remaining)
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
        private const val CHANNEL_ID  = "timer"
        private const val REQUEST_MINUS = 1
        private const val REQUEST_PLUS  = 2
        private const val REQUEST_STOP  = 3
    }
}