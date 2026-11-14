plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android {
    namespace = "im.aqua.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "im.aqua.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
    signingConfigs {
        create("release") {
            System.getenv("AQUA_KEYSTORE")?.let { storeFile = file(it) }
            storePassword = System.getenv("AQUA_STORE_PASSWORD")
            keyAlias = System.getenv("AQUA_KEY_ALIAS")
            keyPassword = System.getenv("AQUA_KEY_PASSWORD")
        }
    }
    buildTypes { release { if (System.getenv("AQUA_KEYSTORE") != null) signingConfig = signingConfigs.getByName("release") } }
    buildFeatures { compose = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
}
