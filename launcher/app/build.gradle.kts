plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.cardash.launcher"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.cardash.launcher"
        minSdk = 23
        targetSdk = 34
        // CI truyền số lần build vào để bản mới luôn cài đè được lên bản cũ.
        versionCode = (project.findProperty("buildNumber") as String?)?.toIntOrNull() ?: 1
        versionName = "1.0." + versionCode
    }

    // Khoá ký cố định, dùng cá nhân: mọi bản build cùng chữ ký nên cập nhật không cần gỡ app.
    signingConfigs {
        create("personal") {
            storeFile = rootProject.file("keystore/cardash.jks")
            storePassword = "cardash123"
            keyAlias = "cardash"
            keyPassword = "cardash123"
        }
    }

    buildTypes {
        debug { signingConfig = signingConfigs.getByName("personal") }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("personal")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}
