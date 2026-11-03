import React,{useEffect,useState} from "react";
import {SafeAreaView,ScrollView,View,Text,TextInput,TouchableOpacity,StyleSheet,Alert} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import {File} from "expo-file-system";
import {createClient} from "@supabase/supabase-js";

const url=process.env.EXPO_PUBLIC_SUPABASE_URL||"";
const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY||"";
const supabase=url&&key?createClient(url,key):null;
const events=["login","break_in","break_out","lunch_in","lunch_out","logout"];

export default function App(){
 const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [profile,setProfile]=useState<any>(null);const [shift,setShift]=useState<any>(null);const [rows,setRows]=useState<any[]>([]);const [busy,setBusy]=useState(false);
 useEffect(()=>{(async()=>{if(!supabase)return;const {data}=await supabase.auth.getSession();if(data.session)await loadProfile(data.session.user.id);})();},[]);
 async function loadProfile(id:string){
  const {data,error}=await supabase!.from("profiles").select("*").eq("id",id).single();
  if(error){Alert.alert("Profile error",error.message);return;}setProfile(data);
  const today=new Date().toLocaleDateString("en-CA");
  const {data:s}=await supabase!.from("shifts").select("*").eq("employee_id",id).eq("shift_date",today).maybeSingle();setShift(s);
  const {data:e}=await supabase!.from("attendance_events").select("*").eq("employee_id",id).gte("created_at",today+"T00:00:00").order("created_at");setRows(e||[]);
 }
 async function signIn(){if(!supabase){Alert.alert("Setup needed","Configure the Supabase URL and publishable key in GitHub Actions secrets.");return;}const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)Alert.alert("Sign in failed",error.message);else if(data.user)await loadProfile(data.user.id);}
 async function acknowledge(){if(!supabase||!profile||!shift)return;const {error}=await supabase.from("shift_acknowledgements").upsert({shift_id:shift.id,employee_id:profile.id,acknowledged:true},{onConflict:"shift_id,employee_id"});if(error)Alert.alert("Error",error.message);else Alert.alert("Saved","Shift acknowledged.");}
 async function record(type:string){
  if(!supabase||!profile||busy)return;
  setBusy(true);let stage="Starting";let photoPath:string|null=null;
  try{
   if(type==="login"||type==="logout"){
    stage="Camera permission";
    const perm=await ImagePicker.requestCameraPermissionsAsync();if(!perm.granted){Alert.alert("Camera permission required","Allow TeamTrack to use the camera, then try again.");return;}
    stage="Taking photo";
    const photo=await ImagePicker.launchCameraAsync({quality:.7});
    if(photo.canceled||!photo.assets[0])return;
    stage="Reading photo";
    const localFile=new File(photo.assets[0].uri);
    const photoData=await localFile.arrayBuffer();
    photoPath=profile.id+"/"+Date.now()+".jpg";
    stage="Uploading photo";
    const {error:uploadError}=await supabase.storage.from("attendance-photos").upload(photoPath,photoData,{contentType:"image/jpeg",upsert:false});
    if(uploadError)throw new Error(uploadError.message);
   }
   stage="Location permission";
   const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted){Alert.alert("Location permission required","Allow TeamTrack to access your location, then try again.");return;}
   stage="Getting GPS";
   const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
   stage="Saving attendance";
   const {error}=await supabase.from("attendance_events").insert({employee_id:profile.id,event_type:type,latitude:pos.coords.latitude,longitude:pos.coords.longitude,photo_path:photoPath,client_recorded_at:new Date().toISOString()});
   if(error)throw new Error(error.message);
   Alert.alert("Attendance saved",type.replace("_"," ")+" recorded.");await loadProfile(profile.id);
  }catch(error:any){
   Alert.alert("Attendance failed",stage+": "+(error?.message||String(error))+"\n\nCheck your internet connection and permissions. If this continues, send me this exact message.");
  }finally{setBusy(false);}
 }
 async function signOut(){await supabase?.auth.signOut();setProfile(null);setRows([]);setShift(null);}
 const button=(label:string,fn:()=>void)=><TouchableOpacity style={[s.btn,busy&&{opacity:.55}]} onPress={fn} disabled={busy}><Text style={s.btnText}>{busy?"PLEASE WAIT":label}</Text></TouchableOpacity>;
 if(!profile)return <SafeAreaView style={s.page}><View style={s.header}><Text style={s.logo}>TeamTrack</Text><Text style={s.sub}>TEAM ATTENDANCE</Text></View><View style={s.card}><Text style={s.heading}>Employee sign in</Text><TextInput style={s.input} placeholder="Work email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/><TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}/>{button("Sign in",signIn)}{!supabase&&<Text style={s.note}>Backend configuration is required before sign-in.</Text>}</View></SafeAreaView>;
 return <SafeAreaView style={s.page}><ScrollView><View style={s.header}><Text style={s.logo}>TeamTrack</Text><Text style={s.sub}>{profile.full_name} • {profile.role}</Text></View><View style={s.card}><Text style={s.heading}>Today's shift</Text><Text style={s.body}>{shift?shift.start_time+" – "+shift.end_time:"No shift assigned"}</Text>{shift&&button("Acknowledge shift",acknowledge)}</View><View style={s.card}><Text style={s.heading}>Attendance actions</Text><Text style={s.note}>GPS is captured when you submit an event. Login and logout require a camera photo.</Text>{events.map(e=><React.Fragment key={e}>{button(e.replace("_"," ").toUpperCase(),()=>record(e))}</React.Fragment>)}</View><View style={s.card}><Text style={s.heading}>Today's activity</Text>{rows.length?rows.map(r=><Text key={r.id} style={s.body}>{r.event_type.toUpperCase()} • {new Date(r.created_at).toLocaleTimeString()}</Text>):<Text style={s.note}>No attendance events yet.</Text>}</View>{button("Sign out",signOut)}</ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:"#F2F5FA",padding:16},header:{backgroundColor:"#14233B",padding:24,borderRadius:18,marginBottom:16},logo:{fontSize:30,fontWeight:"800",color:"#fff"},sub:{fontSize:12,color:"#D1DCEB",marginTop:6},card:{backgroundColor:"#fff",padding:16,borderRadius:16,marginBottom:14},heading:{fontSize:19,fontWeight:"700",color:"#17263D",marginBottom:10},body:{fontSize:15,color:"#34445C",marginVertical:5},input:{borderWidth:1,borderColor:"#D7DFE9",borderRadius:10,padding:13,marginVertical:6},btn:{backgroundColor:"#2468D2",padding:14,borderRadius:11,alignItems:"center",marginTop:9},btnText:{color:"#fff",fontWeight:"700"},note:{fontSize:12,color:"#718096",lineHeight:18,marginTop:8}});
