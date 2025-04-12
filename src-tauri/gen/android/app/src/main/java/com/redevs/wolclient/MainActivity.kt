package com.redevs.wolclient // 사용자의 패키지 이름으로 변경해야 할 수 있습니다.

import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
// import android.view.View // 더 이상 사용하지 않으므로 제거 가능
import android.view.WindowInsetsController // APPEARANCE_* 상수는 여전히 사용될 수 있으므로 유지 (또는 제거 후 직접 값 사용)
import androidx.core.view.WindowCompat // WindowCompat 임포트

class MainActivity : TauriActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // onCreate에서 테마에 따른 시스템 바 색상 적용
        applySystemBarColors()
    }

    // 시스템 테마 변경 감지를 위해 onConfigurationChanged 추가 (선택 사항)
    // AndroidManifest.xml의 activity 태그에 android:configChanges="uiMode" 추가 필요
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // 설정 변경 시 테마에 따른 시스템 바 색상 다시 적용
        applySystemBarColors()
    }

    private fun applySystemBarColors() {
        val window = this.window
        val decorView = window.decorView

        // 현재 테마 모드 확인 (다크 모드 여부)
        val nightModeFlags = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        val isNightMode = nightModeFlags == Configuration.UI_MODE_NIGHT_YES

        // 테마에 따른 색상 결정
        val statusBarColor: Int
        val navigationBarColor: Int

        if (isNightMode) {
            // 다크 모드: 검은색 배경
            statusBarColor = Color.parseColor("#000000")
            navigationBarColor = Color.parseColor("#000000")
        } else {
            // 라이트 모드: 흰색 배경
            statusBarColor = Color.parseColor("#FFFFFF")
            navigationBarColor = Color.parseColor("#FFFFFF")
        }

        // 상태 표시줄 및 네비게이션 바 색상 설정 (API 21 이상)
        window.statusBarColor = statusBarColor
        window.navigationBarColor = navigationBarColor

        // --- 시스템 바 아이콘 색상 설정 (WindowCompat 사용) ---
        // WindowCompat은 내부적으로 API 레벨을 확인하므로, M 이상에서 컨트롤러를 가져옵니다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val controller = WindowCompat.getInsetsController(window, decorView)
            if (controller != null) {
                // isAppearanceLightStatusBars = true 이면 아이콘 어둡게, false 이면 아이콘 밝게
                controller.isAppearanceLightStatusBars = !isNightMode

                // 네비게이션 바 아이콘 제어는 API 26 (Oreo) 부터 가능
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                     // isAppearanceLightNavigationBars = true 이면 아이콘 어둡게, false 이면 아이콘 밝게
                    controller.isAppearanceLightNavigationBars = !isNightMode
                }
            }
        }
    }
}
