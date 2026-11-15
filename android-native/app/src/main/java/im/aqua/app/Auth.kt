package im.aqua.app

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.Image
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

private val AuthBackground = Color(0xff141b2d)
private val AuthText = Color(0xffedf2ff)
private val AuthMuted = Color(0xffaab8d2)
private val AuthField = Color(0xff202b42)
private val AuthBorder = Color(0xff38465f)
private val AuthPrimary = Color(0xffb4c6ee)

@Composable
internal fun Auth(m: AquaModel) {
    var mode by rememberSaveable { mutableStateOf("login") }
    var name by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var ref by rememberSaveable { mutableStateOf("") }
    var botLink by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    val focus = LocalFocusManager.current
    val uri = LocalUriHandler.current

    fun switchMode(next: String, clearAttempt: Boolean = false) {
        mode = next
        code = ""
        if (clearAttempt) { ref = ""; botLink = ""; password = "" }
        m.error = null
        focus.clearFocus()
    }
    fun goBack() {
        if (m.busy) return
        when (mode) {
            "code", "finish" -> switchMode("phone", clearAttempt = true)
            "reset" -> switchMode("recover", clearAttempt = true)
            else -> switchMode("login", clearAttempt = true)
        }
    }
    fun openBot(link: String) {
        try { uri.openUri(link) } catch (_: Exception) { m.error = "Не удалось открыть Telegram. Проверьте, что приложение установлено." }
    }
    BackHandler(mode != "login") { goBack() }

    Column(
        Modifier.fillMaxSize().background(AuthBackground).verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(Modifier.widthIn(max = 370.dp).fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 40.dp, bottom = 32.dp)) {
            Image(painterResource(R.drawable.aqua), "Aqua", Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)))
            Spacer(Modifier.height(24.dp))
            if (mode == "login" || mode == "phone") {
                Row(Modifier.fillMaxWidth().height(48.dp).background(Color(0xff131c30), RoundedCornerShape(22.dp)).padding(4.dp)) {
                    listOf("login" to "Вход", "phone" to "Регистрация").forEach { (value, label) ->
                        TextButton(
                            onClick = { switchMode(value, clearAttempt = true) }, enabled = !m.busy,
                            modifier = Modifier.weight(1f).fillMaxHeight().background(if (mode == value) Color(0xff3d4c70) else Color.Transparent, RoundedCornerShape(18.dp)),
                            contentPadding = PaddingValues(0.dp)
                        ) { Text(label, fontSize = 13.sp, color = if (mode == value) AuthText else AuthMuted) }
                    }
                }
                Spacer(Modifier.height(24.dp))
            } else {
                IconButton(onClick = { goBack() }, enabled = !m.busy, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Назад", tint = AuthPrimary)
                }
                Spacer(Modifier.height(8.dp))
            }
            AnimatedContent(targetState = mode, transitionSpec = {
                (fadeIn(tween(260)) + slideInVertically(tween(300)) { it / 12 }) togetherWith
                    (fadeOut(tween(160)) + slideOutVertically(tween(200)) { -it / 16 }) using SizeTransform(clip = false)
            }, label = "auth page") { page ->
                Column(Modifier.fillMaxWidth()) {
                    Text(when (page) {
                        "login" -> "С возвращением"
                        "phone" -> "Ваш аккаунт Aqua"
                        "code" -> "Подтверждение"
                        "finish" -> "Логин и пароль"
                        "recover" -> "Восстановление пароля"
                        else -> "Новый пароль"
                    }, fontSize = 28.sp, lineHeight = 35.sp, fontWeight = FontWeight.Bold, color = AuthText)
                    Spacer(Modifier.height(8.dp))
                    AuthNote(when (page) {
                        "login" -> "Войдите, чтобы продолжить общение."
                        "phone" -> "Подтвердите Telegram, затем выберите логин и пароль."
                        "code" -> "Код отправлен в Telegram-бота. Введите его здесь. Он действует 15 минут."
                        "finish" -> "Telegram подтверждён. Придумайте логин и пароль для входа в Aqua."
                        "recover" -> "Код для сброса придёт в Telegram, привязанный к аккаунту."
                        else -> "Введите код из Telegram и придумайте новый пароль для входа."
                    })
                    Spacer(Modifier.height(20.dp))
                    m.error?.let { error ->
                        Text(error, Modifier.fillMaxWidth().background(Color(0xff4b293c), RoundedCornerShape(10.dp)).padding(12.dp), color = Color(0xffffb4be), fontSize = 13.sp, lineHeight = 19.sp)
                        Spacer(Modifier.height(16.dp))
                    }
                    when (page) {
                        "phone" -> {
                            AuthStep("1", "Получите идентификатор", "Откройте бота Aqua и нажмите Start. Он выдаст 11 цифр — это ваш идентификатор, а не номер телефона.")
                            Spacer(Modifier.height(14.dp))
                            AuthSecondaryButton("Открыть бота Aqua в Telegram ↗", !m.busy) {
                                m.run { openBot((m.call("/auth/register/bot") as JSONObject).getString("link")) }
                            }
                            Spacer(Modifier.height(20.dp))
                            AuthStep("2", "Вернитесь в Aqua", "Вставьте полученные цифры. Код подтверждения придёт в тот же Telegram-чат.")
                            Spacer(Modifier.height(16.dp))
                            AuthField(phone, { phone = it.filter(Char::isDigit).take(11) }, "Идентификатор из бота", "11 цифр из сообщения бота", number = true)
                        }
                        "code" -> {
                            if (botLink.isNotBlank()) {
                                AuthSecondaryButton("Открыть бота в Telegram", !m.busy) { openBot(botLink) }
                                Spacer(Modifier.height(20.dp))
                            }
                            AuthCode(code) { code = it.filter(Char::isDigit).take(6) }
                        }
                        else -> {
                            if (page != "reset") AuthField(name, { name = it }, "Логин")
                            if (page != "recover") {
                                if (page != "reset") Spacer(Modifier.height(16.dp))
                                AuthField(password, { password = it }, if (page == "reset") "Новый пароль" else "Пароль", password = true)
                            }
                            if (page == "reset") {
                                if (botLink.isNotBlank()) {
                                    Spacer(Modifier.height(16.dp))
                                    AuthSecondaryButton("Открыть бота в Telegram", !m.busy) { openBot(botLink) }
                                }
                                Spacer(Modifier.height(16.dp)); AuthCode(code) { code = it.filter(Char::isDigit).take(6) }
                            }
                        }
                    }
                    Spacer(Modifier.height(20.dp))
                    Button(
                        onClick = {
                            focus.clearFocus()
                            when (page) {
                                "login" -> m.login(name.trim(), password)
                                "phone" -> m.run {
                                    require(phone.length == 11) { "Вставьте 11 цифр идентификатора из сообщения бота Aqua." }
                                    val result = m.call("/auth/register/phone", "POST", obj("phone" to phone)) as JSONObject
                                    ref = result.getString("ref"); botLink = result.getString("link"); mode = "code"
                                }
                                "code" -> m.run { m.call("/auth/register/code", "POST", obj("ref" to ref, "code" to code)); code = ""; mode = "finish" }
                                "finish" -> m.run { m.acceptSession(m.call("/auth/register", "POST", obj("ref" to ref, "username" to name.trim(), "password" to password)) as JSONObject); password = ""; m.refresh() }
                                "recover" -> m.run { val result = m.call("/auth/reset/code", "POST", obj("username" to name.trim())) as JSONObject; ref = result.getString("ref"); botLink = result.optString("link"); mode = "reset" }
                                "reset" -> m.run { m.acceptSession(m.call("/auth/reset", "POST", obj("ref" to ref, "code" to code, "password" to password)) as JSONObject); password = ""; code = ""; m.refresh() }
                            }
                        },
                        enabled = !m.busy && (page !in listOf("code", "reset") || code.length == 6),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = AuthPrimary, contentColor = Color(0xff263654))
                    ) { Text(if (m.busy) "Подождите…" else when (page) {
                        "login" -> "Войти"; "phone" -> "Получить код в Telegram"; "code" -> "Подтвердить"
                        "finish" -> "Создать аккаунт"; "recover" -> "Отправить код"; else -> "Сохранить пароль"
                    }, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                    if (page == "login") TextButton(onClick = { switchMode("recover", clearAttempt = true) }, enabled = !m.busy, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Забыли пароль?", fontSize = 13.sp, color = AuthPrimary) }
                }
            }
        }
    }
}

@Composable
private fun AuthNote(text: String) { Text(text, fontSize = 12.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium, color = AuthMuted) }

@Composable
private fun AuthStep(number: String, title: String, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.size(28.dp).background(Color(0xff354a73), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) { Text(number, color = Color(0xffcbd9ff), fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        Column { Text(title, fontSize = 13.sp, color = AuthText, fontWeight = FontWeight.Bold); Spacer(Modifier.height(4.dp)); AuthNote(text) }
    }
}

@Composable
private fun AuthSecondaryButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, Color(0xff455b85)), colors = ButtonDefaults.outlinedButtonColors(containerColor = Color(0xff2b3c5c), contentColor = Color(0xffd8e4ff))) {
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    }
}

@Composable
private fun AuthField(value: String, onChange: (String) -> Unit, label: String, placeholder: String = "", password: Boolean = false, number: Boolean = false) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    Column {
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xffc0cce2))
        Spacer(Modifier.height(8.dp))
        BasicTextField(value, onChange, modifier = Modifier.fillMaxWidth().semantics { contentDescription = label }, singleLine = true,
            visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = when { password -> KeyboardType.Password; number -> KeyboardType.Number; else -> KeyboardType.Text }),
            textStyle = LocalTextStyle.current.copy(fontSize = 16.sp, color = AuthText), cursorBrush = SolidColor(AuthPrimary), interactionSource = interaction,
            decorationBox = { inner ->
                Box(Modifier.fillMaxWidth().heightIn(min = 48.dp).background(AuthField, RoundedCornerShape(14.dp)).border(1.dp, if (focused) AuthPrimary else AuthBorder, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 12.dp), contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, fontSize = 16.sp, color = Color(0xff8f9fbd))
                    inner()
                }
            })
    }
}

@Composable
private fun AuthCode(code: String, onChange: (String) -> Unit) {
    BasicTextField(value = code, onValueChange = onChange, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), cursorBrush = SolidColor(Color.Transparent),
        textStyle = TextStyle(color = Color.Transparent, fontSize = 20.sp),
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Код подтверждения из Telegram" },
        decorationBox = { inner ->
            Box {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    repeat(6) { index ->
                        Box(Modifier.weight(1f).height(52.dp).background(AuthField, RoundedCornerShape(12.dp)).then(Modifier.clip(RoundedCornerShape(12.dp))).background(if (index < code.length) Color(0xff354a73) else Color.Transparent), contentAlignment = Alignment.Center) {
                            Text(code.getOrNull(index)?.toString() ?: "", style = TextStyle(color = AuthText, fontSize = 20.sp, fontWeight = FontWeight.Bold))
                        }
                    }
                }
                // Place the real input over all six boxes so the entire area accepts taps and paste.
                Box(Modifier.matchParentSize(), propagateMinConstraints = true) { inner() }
            }
        })
}
