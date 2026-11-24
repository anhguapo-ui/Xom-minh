plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.rubikbe"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.rubikbe"
        minSdk = 23
        targetSdk = 34
        // CI truyền số lần build vào để bản mới luôn cài đè được lên bản cũ.
        versionCode = (project.findProperty("buildNumber") as String?)?.toIntOrNull() ?: 1
        versionName = "1.0." + versionCode
    }

    // Khoá ký cố định, dùng cá nhân: mọi bản build cùng chữ ký nên cập nhật không cần gỡ app.
    signingConfigs {
        create("personal") {
            storeFile = rootProject.file("keystore/rubik.jks")
            storePassword = "rubikbe123"
            keyAlias = "rubikbe"
            keyPassword = "rubikbe123"
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

    // Ảnh chụp màn hình tự động (Robolectric) để kiểm tra giao diện trên máy build.
    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
}
