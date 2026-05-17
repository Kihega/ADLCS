import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Calendar, X, CheckCircle2, Copy } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import AsyncStorage   from '@react-native-async-storage/async-storage'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { apiPost, isOnline } from '../../services/syncService'

import { FileText, Cross, Heart, Home, Landmark, Navigation,
         Users, Search, ChevronRight, WifiOff, RefreshCw } from 'lucide-react-native'
import { FlatList, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { getAllBirths, getAllDeaths } from '../../services/localDb'
import { apiGet } from '../../services/syncService'

type VStack = { VillageHome:undefined; VillageViewRecords:undefined }
type Props  = { navigation: NativeStackNavigationProp<VStack,'VillageViewRecords'> }

type RecordType = 'all'|'citizens'|'deaths'|'marriages'|'buildings'|'migrations'
interface Rec { id:string; type:RecordType; label:string; sub:string; date:string; synced:boolean; icon:string; color:string }

export default function VillageViewRecordsScreen({ navigation }: Props) {
  const { theme:T } = useTheme()
  const [filter,     setFilter]    = useState<RecordType>('all')
  const [records,    setRecords]   = useState<Rec[]>([])
  const [loading,    setLoading]   = useState(true)
  const [refreshing, setRefreshing]= useState(false)
  const [offline,    setOffline]   = useState(false)
  const [query,      setQuery]     = useState('')

  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true)
    const online = isOnline()
    setOffline(!online)
    const out: Rec[] = []

    // Local SQLite deaths
    const deaths = await getAllDeaths()
    for (const d of deaths) {
      out.push({ id:`d-${d.id}`, type:'deaths', label:d.deceasedName||d.nationalId||'Unknown',
        sub:`Cert: ${d.certNo}`, date:new Date(d.registeredAt).toLocaleDateString('en-TZ'),
        synced:d.synced===1, icon:'✝', color:'#dc2626' })
    }

    // Remote if online
    if (online) {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      if (token) {
        try {
          const j = await apiGet('/village/records')
          if (j.success && Array.isArray(j.data)) {
            for (const r of j.data) {
              if (!out.find(x=>x.id===`r-${r.id}`)) {
                out.push({ id:`r-${r.id}`, type:r.type as RecordType,
                  label:r.label||r.name||'—', sub:r.sub||r.certNo||'',
                  date:r.date||'—', synced:true, icon:r.icon||'📋', color:r.color||'#0891b2' })
              }
            }
          }
        } catch {}
      }
    }

    const q = query.trim().toLowerCase()
    const filtered = out
      .filter(r => filter==='all' || r.type===filter)
      .filter(r => !q || r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q))
      .sort((a,b)=>b.date.localeCompare(a.date))
    setRecords(filtered)
    setLoading(false); setRefreshing(false)
  }, [filter, query])

  useFocusEffect(useCallback(()=>{ load() },[load]))

  const TABS: {val:RecordType;label:string;icon:string}[] = [
    {val:'all',        label:'All',        icon:'📋'},
    {val:'citizens',   label:'Citizens',   icon:'👤'},
    {val:'deaths',     label:'Deaths',     icon:'✝'},
    {val:'marriages',  label:'Marriages',  icon:'💍'},
    {val:'buildings',  label:'Buildings',  icon:'🏠'},
    {val:'migrations', label:'Migrations', icon:'📍'},
  ]

  return (
    <SafeAreaView style={{flex:1,backgroundColor:T.bg}} edges={['top']}>
      <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:12,borderBottomWidth:1,backgroundColor:T.card,borderBottomColor:T.border}}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={{width:36,height:36,alignItems:'center',justifyContent:'center'}}>
          <ArrowLeft size={20} color={T.text}/>
        </TouchableOpacity>
        <View style={{flex:1,alignItems:'center'}}>
          <Text style={{fontSize:15,fontWeight:'800',color:T.text}}>Village Records</Text>
          <Text style={{fontSize:11,color:T.textSub,marginTop:2}}>{records.length} entries</Text>
        </View>
        <TouchableOpacity style={{width:36,height:36,alignItems:'center',justifyContent:'center'}} onPress={()=>load()}>
          <RefreshCw size={16} color={T.textSub}/>
        </TouchableOpacity>
      </View>

      {offline && (
        <View style={{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:14,paddingVertical:7,borderBottomWidth:1,backgroundColor:'#f9731615',borderBottomColor:'#f9731630'}}>
          <WifiOff size={12} color="#f97316"/>
          <Text style={{fontSize:11,color:'#f97316'}}>Offline — showing locally stored records</Text>
        </View>
      )}

      {/* Search */}
      <View style={{paddingHorizontal:14,paddingVertical:8,borderBottomWidth:1,backgroundColor:T.card,borderBottomColor:T.border}}>
        <View style={{flexDirection:'row',alignItems:'center',borderWidth:1,borderRadius:10,paddingHorizontal:12,height:40,borderColor:T.border,backgroundColor:T.card2}}>
          <Search size={14} color={T.textDim}/>
          <TextInput style={{flex:1,color:T.text,marginLeft:8,fontSize:13}} value={query} onChangeText={setQuery}
            placeholder="Search records…" placeholderTextColor={T.textDim} returnKeyType="search" blurOnSubmit={false}/>
        </View>
      </View>

      {/* Tab filter */}
      <View style={{borderBottomWidth:1,borderBottomColor:T.border,backgroundColor:T.card}}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:12,gap:6,flexDirection:'row',paddingVertical:8}}>
          {TABS.map(tab=>(
            <TouchableOpacity key={tab.val} onPress={()=>setFilter(tab.val)}
              style={{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:12,paddingVertical:6,borderRadius:20,borderWidth:1,
                      borderColor:filter===tab.val?'#1eb53a':T.border,backgroundColor:filter===tab.val?'#1eb53a18':T.card2}}>
              <Text style={{fontSize:11}}>{tab.icon}</Text>
              <Text style={{fontSize:11,fontWeight:'600',color:filter===tab.val?'#1eb53a':T.textSub}}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator size="large" color="#1eb53a"/></View>
      : <FlatList data={records} keyExtractor={r=>r.id}
          contentContainerStyle={{padding:12,paddingBottom:40,gap:8}}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load(true)}} tintColor="#1eb53a"/>}
          renderItem={({item})=>(
            <View style={{borderWidth:1,borderRadius:12,padding:12,backgroundColor:T.card,borderColor:T.border}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
                <View style={{width:42,height:42,borderRadius:21,backgroundColor:`${item.color}18`,alignItems:'center',justifyContent:'center'}}>
                  <Text style={{fontSize:18}}>{item.icon}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={{fontSize:13,fontWeight:'700',color:T.text}} numberOfLines={1}>{item.label}</Text>
                  <Text style={{fontSize:11,color:item.color,marginTop:2}}>{item.sub}</Text>
                  <View style={{flexDirection:'row',gap:6,marginTop:4}}>
                    <View style={{borderWidth:1,borderRadius:8,paddingHorizontal:7,paddingVertical:2,
                      borderColor:item.synced?`${TZ.green}40`:'#f9731640',
                      backgroundColor:item.synced?`${TZ.green}18`:'#f9731618'}}>
                      <Text style={{fontSize:9,fontWeight:'700',color:item.synced?TZ.green:'#f97316'}}>
                        {item.synced?'Synced':'Pending sync'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={{alignItems:'flex-end',gap:4}}>
                  <Text style={{fontSize:10,color:T.textDim}}>{item.date}</Text>
                  <ChevronRight size={13} color={T.textDim}/>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={{alignItems:'center',paddingTop:60,gap:12}}>
              <Text style={{fontSize:32}}>📋</Text>
              <Text style={{fontSize:14,fontWeight:'700',color:T.textSub}}>No records found</Text>
              <Text style={{fontSize:12,color:T.textDim,textAlign:'center'}}>
                {offline?'No local records. Register activities to see them here.':'No records match your search.'}
              </Text>
            </View>
          }
        />
      }
    </SafeAreaView>
  )
}