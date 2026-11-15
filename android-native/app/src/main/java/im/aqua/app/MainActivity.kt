package im.aqua.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.*
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import org.json.*

private val Navy=Color(0xff131a2b)
private val Surface=Color(0xff25324b)
private val Accent=Color(0xffb1c5ff)
class MainActivity: ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen(); super.onCreate(savedInstanceState)
        setContent {
            val font=FontFamily(Font(R.font.manrope_400,FontWeight.Normal),Font(R.font.manrope_500,FontWeight.Medium),Font(R.font.manrope_600,FontWeight.SemiBold),Font(R.font.manrope_700,FontWeight.Bold))
            val typography=Typography().let { it.copy(
                displayLarge=it.displayLarge.copy(fontFamily=font),displayMedium=it.displayMedium.copy(fontFamily=font),displaySmall=it.displaySmall.copy(fontFamily=font),
                headlineLarge=it.headlineLarge.copy(fontFamily=font),headlineMedium=it.headlineMedium.copy(fontFamily=font),headlineSmall=it.headlineSmall.copy(fontFamily=font),
                titleLarge=it.titleLarge.copy(fontFamily=font),titleMedium=it.titleMedium.copy(fontFamily=font),titleSmall=it.titleSmall.copy(fontFamily=font),
                bodyLarge=it.bodyLarge.copy(fontFamily=font),bodyMedium=it.bodyMedium.copy(fontFamily=font),bodySmall=it.bodySmall.copy(fontFamily=font),
                labelLarge=it.labelLarge.copy(fontFamily=font),labelMedium=it.labelMedium.copy(fontFamily=font),labelSmall=it.labelSmall.copy(fontFamily=font)) }

            MaterialTheme(colorScheme=darkColorScheme(primary=Accent,background=Navy,surface=Navy,surfaceVariant=Surface,onSurface=Color(0xffedf2ff)),typography=typography) {
                Aqua(viewModel())
            }
        }
    }
}
@Composable private fun Aqua(model: AquaModel) {
    var tab by rememberSaveable { mutableStateOf(0) }
    var search by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    BackHandler(model.selected!=null || search || tab!=0) { when { model.selected!=null -> model.back(); search -> { search=false;query="" }; else -> tab=0 } }
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().imePadding().padding(horizontal=16.dp)) {
            if(model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if(model.user!=null) model.error?.let { error -> Row(Modifier.fillMaxWidth().padding(8.dp),verticalAlignment=Alignment.CenterVertically) { Text(error,Modifier.weight(1f),color=MaterialTheme.colorScheme.error); TextButton(onClick={model.error=null}){Text("✕")} } }
            if(model.user==null) { Auth(model); return@Column }
            if(model.selected!=null) { Conversation(model); return@Column }
            Row(Modifier.fillMaxWidth().padding(vertical=18.dp),verticalAlignment=Alignment.CenterVertically) {
                Image(painterResource(R.drawable.aqua),null,Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)))
                Text(listOf("Aqua","Контакты","Профиль","Настройки")[tab],Modifier.weight(1f).padding(start=12.dp),fontSize=26.sp,fontWeight=FontWeight.Bold)
                IconButton(onClick={model.run{model.refresh()}}){Icon(Icons.Rounded.Refresh,"Обновить")}
            }
            Box(Modifier.weight(1f)) {
                AnimatedContent(tab,label="section") { section -> when(section) {
                    0 -> LazyColumn(verticalArrangement=Arrangement.spacedBy(3.dp)) {
                        if(model.chats.isEmpty()) item { Text("Пока нет чатов. Найдите собеседника в контактах.",Modifier.padding(24.dp)) }
                        items(model.chats.filter{it.optString("title").contains(query,true)}, key={it.getInt("id")}) { c ->
                            val last=c.optJSONObject("last_message")
                            PersonRow(c.optString("title"),last?.optString("text")?.ifBlank{"Медиа"} ?: "Нет сообщений",last?.optString("created_at")?.drop(11)?.take(5).orEmpty()){model.open(c)}
                        }
                    }
                    1 -> Contacts(model)
                    2 -> Profile(model)
                    else -> Settings(model)
                } }
            }
            BoxWithConstraints(Modifier.fillMaxWidth().padding(vertical=12.dp).height(52.dp)) {
                val progress by animateFloatAsState(if(search)1f else 0f,tween(400),label="search morph")
                val full=maxWidth
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.weight(1f).height(52.dp).clip(CircleShape).background(Surface),verticalAlignment=Alignment.CenterVertically) {
                        val icons=listOf(Icons.Rounded.ChatBubble,Icons.Rounded.People,Icons.Rounded.Person,Icons.Rounded.Settings)
                        icons.forEachIndexed { index, icon -> IconButton(onClick={tab=index;search=false;query=""},modifier=Modifier.weight(1f).padding(4.dp).background(if(tab==index) Color(0xff40537e) else Color.Transparent,CircleShape)) { Icon(icon,listOf("Чаты","Контакты","Профиль","Настройки")[index]) } }
                    }
                    if(tab==0) IconButton(onClick={search=true},modifier=Modifier.size(52.dp).background(Color(0xff3b5589),RoundedCornerShape(18.dp))) { Icon(Icons.Rounded.Search,"Поиск") }
                }
                if(search || progress>0f) Row(Modifier.offset(x=(full-52.dp)*(1-progress)).width(52.dp+(full-52.dp)*progress).height(52.dp).background(Surface,RoundedCornerShape(18.dp)),verticalAlignment=Alignment.CenterVertically) {
                    if(progress>.95f) { TextField(query,{query=it},Modifier.weight(1f),placeholder={Text("Найти чат")},singleLine=true); IconButton(onClick={search=false;query=""}){Icon(Icons.Rounded.Close,"Закрыть поиск")} }
                }
            }
        }
    }
}
@Composable private fun PersonRow(name:String, subtitle:String, time:String="", onClick:()->Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Surface).clickable(onClick=onClick).padding(12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        val colors=listOf(Color(0xff21b6b2),Color(0xff7773db),Color(0xff388dcd),Color(0xffc86ba5))
        Box(Modifier.size(48.dp).background(colors[(name.hashCode() and Int.MAX_VALUE)%colors.size],CircleShape),contentAlignment=Alignment.Center){Text(name.take(1).uppercase(),fontSize=22.sp)}
        Column(Modifier.weight(1f)){Text(name,maxLines=1,overflow=TextOverflow.Ellipsis,fontWeight=FontWeight.Bold);Text(subtitle,maxLines=1,overflow=TextOverflow.Ellipsis,fontSize=12.sp,color=Color(0xffb2bfd6))}
        if(time.isNotEmpty())Text(time,fontSize=10.sp,color=Accent)
    }
}
@Composable private fun Field(value:String,onChange:(String)->Unit,label:String,password:Boolean=false) {
    if(password) OutlinedTextField(value,onChange,Modifier.fillMaxWidth(),label={Text(label)},singleLine=true,visualTransformation=PasswordVisualTransformation())
    else OutlinedTextField(value,onChange,Modifier.fillMaxWidth(),label={Text(label)},singleLine=true)
}
@Composable private fun Contacts(m:AquaModel) {
    var query by rememberSaveable { mutableStateOf("") };var results by remember { mutableStateOf<List<JSONObject>?>(null) }
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Field(query,{query=it},"Username или имя")
        Button(onClick={m.run { results=(m.call("/users/search?q="+java.net.URLEncoder.encode(query,"UTF-8")) as JSONArray).objects() }},enabled=query.isNotBlank()&&!m.busy){Text("Найти")}
        LazyColumn(verticalArrangement=Arrangement.spacedBy(4.dp)) { items(results?:m.contacts,key={it.getInt("id")}) { u ->
            Column { PersonRow(u.optString("display_name").ifBlank{u.getString("username")},"@"+u.getString("username")){m.direct(u.getString("username"))}
                if(results!=null)TextButton(onClick={m.run{m.call("/contacts/${u.getInt("id")}","PUT");m.refresh();results=null}}){Text("Добавить в контакты")}
            }
        } }
    }
}
@Composable private fun Profile(m:AquaModel) {
    var name by remember(m.user){mutableStateOf(m.user?.optString("display_name").orEmpty())}
    var bio by remember(m.user){mutableStateOf(m.user?.optString("bio").orEmpty())}
    Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        PersonRow(name.ifBlank{m.user!!.getString("username")},"@"+m.user!!.getString("username")){}
        Field(name,{name=it},"Имя");Field(bio,{bio=it},"О себе")
        Button(onClick={m.run{m.call("/profile","PATCH",obj("display_name" to name,"bio" to bio));m.reloadProfile()}},enabled=!m.busy){Text("Сохранить")}
    }
}
@Composable private fun Settings(m:AquaModel) {
    var hidden by remember(m.user){mutableStateOf(m.user?.optJSONObject("privacy")?.optJSONObject("hide_activity")?.optString("mode")=="all")}
    var current by remember{mutableStateOf("")};var replacement by remember{mutableStateOf("")}
    Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        Text("Аккаунт",color=Accent);Text("@"+m.user!!.getString("username"))
        Text("Конфиденциальность",color=Accent)
        Row(verticalAlignment=Alignment.CenterVertically){Text("Скрыть активность от всех",Modifier.weight(1f));Switch(hidden,{value->m.run{m.call("/profile/privacy","PUT",obj("hide_activity" to obj("mode" to if(value)"all" else "none")));hidden=value;m.reloadProfile()}},enabled=!m.busy)}
        Text("Изменить пароль",color=Accent)
        Field(current,{current=it},"Текущий пароль",true);Field(replacement,{replacement=it},"Новый пароль",true)
        Button(onClick={m.run{m.call("/profile/password","PUT",obj("current_password" to current,"new_password" to replacement));current="";replacement=""}},enabled=!m.busy&&replacement.isNotBlank()){Text("Изменить пароль")}
        Text("Подключение",color=Accent);Text(m.server)
        Text("Оформление",color=Accent);Text("Aqua · глубокая синяя тема")
        OutlinedButton(onClick={m.logout()}){Text("Выйти из аккаунта")}
    }
}
@Composable private fun ColumnScope.Conversation(m:AquaModel) {
    val chat=m.selected!!
    val attachment=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){it?.let(m::attach)}
    var actionMessage by remember { mutableStateOf<JSONObject?>(null) }
    var edited by remember { mutableStateOf("") }
    actionMessage?.let { selected -> AlertDialog(onDismissRequest={actionMessage=null},title={Text("Сообщение")},text={Column {
        Row { listOf("👍","❤️","🔥").forEach { emoji -> TextButton(onClick={m.messageAction(selected.getInt("id"),"react",emoji);actionMessage=null}){Text(emoji)} } }
        if(selected.optJSONObject("sender")?.optInt("id")==m.user!!.getInt("id")) { Field(edited,{edited=it},"Текст");TextButton(onClick={m.messageAction(selected.getInt("id"),"edit",edited);actionMessage=null}){Text("Сохранить изменение")} }
        TextButton(onClick={m.messageAction(selected.getInt("id"),"pin");actionMessage=null}){Text("Закрепить")}
        TextButton(onClick={m.messageAction(selected.getInt("id"),"delete");actionMessage=null}){Text("Удалить у меня")}
    }},confirmButton={TextButton(onClick={actionMessage=null}){Text("Закрыть")}}) }
    var draft by rememberSaveable(chat.getInt("id")){mutableStateOf("")}
    Row(verticalAlignment=Alignment.CenterVertically) { IconButton(onClick={m.back()}){Icon(Icons.Rounded.ArrowBack,"Назад")};Text(chat.getString("title"),fontWeight=FontWeight.Bold,fontSize=20.sp) }
    val scroll=androidx.compose.foundation.lazy.rememberLazyListState()
    LaunchedEffect(m.messages.lastOrNull()?.optInt("id")){if(m.messages.isNotEmpty())scroll.animateScrollToItem(m.messages.size)}
    LazyColumn(Modifier.weight(1f).fillMaxWidth(),state=scroll,verticalArrangement=Arrangement.spacedBy(5.dp)) {
        item { TextButton(onClick={m.older()},enabled=!m.busy){Text("Загрузить предыдущие") } }
        items(m.messages,key={it.getInt("id")}) { msg ->
            val mine=msg.optJSONObject("sender")?.optInt("id")==m.user!!.getInt("id")
            Row(Modifier.animateItem().fillMaxWidth(),horizontalArrangement=if(mine)Arrangement.End else Arrangement.Start) {
                Column(Modifier.clickable{actionMessage=msg;edited=msg.optString("text")}.widthIn(max=310.dp).clip(RoundedCornerShape(topStart=18.dp,topEnd=18.dp,bottomStart=if(mine)18.dp else 5.dp,bottomEnd=if(mine)5.dp else 18.dp)).background(if(mine)Color(0xff3a4977) else Surface).padding(10.dp)) {
                    msg.optJSONObject("media")?.let { media ->
                        if(msg.optString("kind")=="image") AsyncImage(ImageRequest.Builder(LocalContext.current).data(m.server+media.optString("url")).addHeader("Authorization","Bearer ${m.token}").build(),media.optString("name"),Modifier.widthIn(max=280.dp).heightIn(max=240.dp))
                        else Text(media.optString("name","Медиа"),color=Accent)
                    }
                    if(msg.optString("text").isNotBlank())Text(msg.optString("text"),fontSize=14.sp)
                    Text(msg.optString("created_at").drop(11).take(5),Modifier.align(Alignment.End),fontSize=10.sp,color=Color(0xffc0cce3))
                }
            }
        }
    }
    if(chat.optBoolean("can_post",true))Row(Modifier.padding(vertical=8.dp),verticalAlignment=Alignment.CenterVertically) {
        IconButton(enabled=!m.busy,onClick={attachment.launch("*/*")}){Icon(Icons.Rounded.AttachFile,"Вложение")}
        OutlinedTextField(draft,{draft=it},Modifier.weight(1f),placeholder={Text("Сообщение")},shape=RoundedCornerShape(24.dp),maxLines=5)
        IconButton(enabled=draft.isNotBlank()&&!m.busy,onClick={m.send(draft){draft=""}}){Icon(Icons.Rounded.Send,"Отправить")}
    }
}
