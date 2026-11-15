package im.aqua.app

import android.app.Application
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.*
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

fun obj(vararg pairs: Pair<String, Any>) = JSONObject().apply { pairs.forEach { put(it.first, it.second) } }
fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }

/** Only encrypted session material is persisted. The AES key stays in Android Keystore. */
class SessionStore(app: Application) {
    private val prefs = app.getSharedPreferences("aqua", 0)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("aqua.session", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("aqua.session", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun save(server: String, token: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(obj("server" to server, "token" to token).toString().toByteArray())
        prefs.edit().putString("session", Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)).apply()
    }
    fun read(): JSONObject? = runCatching {
        val bytes = Base64.decode(prefs.getString("session", null) ?: return null, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0,12))) }
        JSONObject(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size))))
    }.getOrNull()
    fun clear() { prefs.edit().clear().apply() }
}

class ApiFailure(val status: Int, message: String): Exception(message)
class AquaModel(app: Application): AndroidViewModel(app) {
    private val store = SessionStore(app)
    private val http = OkHttpClient.Builder().pingInterval(25, java.util.concurrent.TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).callTimeout(25, java.util.concurrent.TimeUnit.SECONDS).build()
    val server = BuildConfig.AQUA_BASE_URL; var token by mutableStateOf(""); private set
    var user by mutableStateOf<JSONObject?>(null); private set
    suspend fun reloadProfile() { user=call("/auth/me") as JSONObject }
    var chats by mutableStateOf(emptyList<JSONObject>()); private set
    var contacts by mutableStateOf(emptyList<JSONObject>()); private set
    var messages by mutableStateOf(emptyList<JSONObject>()); private set
    var selected by mutableStateOf<JSONObject?>(null); private set
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null)
    private var socket: WebSocket? = null
    private var epoch = 0
    init { store.read()?.let { if (it.optString("server") != server) { store.clear(); return@let }; token=it.getString("token"); run { user=call("/auth/me") as JSONObject; refresh(); connect() } } }
    suspend fun call(path: String, method: String = "GET", body: JSONObject? = null): Any = withContext(Dispatchers.IO) {
        require(server.startsWith("https://") && java.net.URI(server).host != null) { "Не удалось подключиться к Aqua" }
        val request = Request.Builder().url(server.trimEnd('/') + "/api" + path)
        if(token.isNotEmpty()) request.header("Authorization", "Bearer $token")
        request.method(method, if(method=="GET"||method=="DELETE") null else (body ?: JSONObject()).toString().toRequestBody("application/json".toMediaType()))
        http.newCall(request.build()).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val parsed = if(raw.isBlank()) JSONObject() else JSONTokener(raw).nextValue()
            if(!response.isSuccessful) throw ApiFailure(response.code, (parsed as? JSONObject)?.opt("detail")?.toString() ?: "Ошибка сервера ${response.code}")
            parsed
        }
    }
    fun run(action: suspend () -> Unit) {
        if(busy) return
        viewModelScope.launch { busy=true; error=null; try { action() } catch(e: CancellationException) { throw e } catch(e: Exception) {
            if(e is ApiFailure && e.status==401 && token.isNotEmpty()) logout()
            error=e.message ?: "Нет соединения с сервером"
        } finally { busy=false } }
    }
    fun acceptSession(result: JSONObject) { token=result.getString("token"); user=result.getJSONObject("user"); store.save(server,token); connect() }
    fun login(name: String, password: String) = run { acceptSession(call("/auth/login","POST",obj("username" to name,"password" to password)) as JSONObject); refresh() }
    suspend fun refresh() { chats=(call("/chats") as JSONArray).objects(); contacts=(call("/contacts") as JSONArray).objects() }
    fun open(chat: JSONObject) = run { val history=(call("/chats/${chat.getInt("id")}/messages") as JSONArray).objects(); selected=chat; messages=history; markRead() }
    private suspend fun markRead() { messages.lastOrNull()?.let { call("/chats/${selected!!.getInt("id")}/read","POST",obj("up_to" to it.getInt("id"))) } }
    fun back() { selected=null; messages=emptyList() }
    fun send(text: String, onSuccess: () -> Unit) = run {
        val id=selected!!.getInt("id")
        call("/chats/$id/messages","POST",obj("text" to text))
        messages=(call("/chats/$id/messages") as JSONArray).objects(); onSuccess(); refresh()
    }
    fun direct(username: String) = run {
        val chat=call("/chats","POST",obj("type" to "direct","username" to username)) as JSONObject
        selected=chat; messages=(call("/chats/${chat.getInt("id")}/messages") as JSONArray).objects(); refresh()
    }
    fun older() = run { val id=messages.firstOrNull()?.getInt("id") ?: return@run; messages=(call("/chats/${selected!!.getInt("id")}/messages?before_id=$id") as JSONArray).objects()+messages }
    fun attach(uri: android.net.Uri) = run {
        val chatId=selected!!.getInt("id")
        val result=withContext(Dispatchers.IO) {
            val resolver=getApplication<Application>().contentResolver
            val type=resolver.getType(uri) ?: "application/octet-stream"
            val temp=java.io.File.createTempFile("upload", ".bin",getApplication<Application>().cacheDir)
            try {
                resolver.openInputStream(uri)!!.use { input -> temp.outputStream().use { output ->
                    val buffer=ByteArray(8192); var total=0L
                    while(true) { val count=input.read(buffer); if(count<0)break; total+=count; require(total<=50L*1024*1024){"Файл больше 50 МБ"}; output.write(buffer,0,count) }
                } }
                var name="attachment"
                resolver.query(uri,null,null,null,null)?.use { cursor -> if(cursor.moveToFirst()) { val col=cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME); if(col>=0)name=cursor.getString(col) } }
                val body=MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("file",name,object: RequestBody(){
                    override fun contentType()=type.toMediaType()
                    override fun contentLength()=temp.length()
                    override fun writeTo(sink: okio.BufferedSink){ temp.inputStream().use { input -> val b=ByteArray(8192);while(true){val n=input.read(b);if(n<0)break;sink.write(b,0,n)} } }
                }).build()
                http.newCall(Request.Builder().url(server+"/api/media").header("Authorization","Bearer $token").post(body).build()).execute().use { response ->
                    val json=JSONObject(response.body!!.string()); if(!response.isSuccessful)throw ApiFailure(response.code,json.optString("detail"));json
                }
            } finally { temp.delete() }
        }
        call("/chats/$chatId/messages","POST",obj("media_id" to result.getInt("id")))
        messages=(call("/chats/$chatId/messages") as JSONArray).objects();refresh()
    }
    fun messageAction(id: Int, action: String, value: String="") = run {
        when(action) {
            "delete" -> call("/messages/$id?scope=me","DELETE")
            "edit" -> call("/messages/$id","PATCH",obj("text" to value))
            "react" -> call("/messages/$id/reactions","PUT",obj("emoji" to value))
            "pin" -> call("/chats/${selected!!.getInt("id")}/pin","PUT",obj("message_id" to id))
        }
        messages=(call("/chats/${selected!!.getInt("id")}/messages") as JSONArray).objects();refresh()
    }
    fun logout() { epoch++; socket?.close(1000,"Logout"); socket=null; store.clear(); token=""; user=null; chats=emptyList(); contacts=emptyList(); back() }
    fun connect() {
        val generation=++epoch
        socket?.close(1000,"Reconnect")
        socket=http.newWebSocket(Request.Builder().url(server.trimEnd('/').replaceFirst("https://","wss://")+"/ws").build(), object: WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) { ws.send(obj("type" to "auth","token" to token).toString()) }
            override fun onMessage(ws: WebSocket, text: String) {
                viewModelScope.launch {
                    if(generation!=epoch) return@launch
                    try { val event=JSONObject(text).optString("type"); if(event !in listOf("pong","typing","presence")) { refresh(); selected?.let { messages=(call("/chats/${it.getInt("id")}/messages") as JSONArray).objects() } } }
                    catch(e: Exception) { if(e is CancellationException) throw e; error=e.message }
                }
            }
            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) { retry(generation) }
            override fun onClosed(ws: WebSocket, code: Int, reason: String) { retry(generation) }
        })
    }
    private fun retry(generation: Int) { viewModelScope.launch { if(generation!=epoch) return@launch; error="Соединение прервано. Переподключение…"; delay(5000); if(generation==epoch && token.isNotEmpty()) connect() } }
    override fun onCleared() { epoch++; socket?.cancel(); http.dispatcher.executorService.shutdown() }
}
