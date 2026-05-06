// ── FULL TANZANIA GEO DATA ────────────────────────────────
// Regions → Districts → Wards/Villages
// Source: NBS Tanzania 2022 Census administrative units

export const TZ_GEO = {
  "Dar es Salaam": {
    jurisdiction: "mainland",
    districts: {
      "Ilala":     ["Buguruni","Chang'ombe","Gerezani","Kariakoo","Kivukoni","Mchikichini","Msongola","Segerea","Tabata","Ukonga"],
      "Kinondoni": ["Kawe","Kibamba","Kinondoni","Magomeni","Makuburi","Mbezi","Msasani","Ndugumbi","Sinza","Tandale"],
      "Temeke":    ["Azimio","Chamazi","Chang'ombe South","Keko","Kurasini","Mbagala","Miburani","Temeke","Toangoma","Vijibweni"],
      "Ubungo":    ["Kimara","Kwembe","Lubaga","Makuburi","Mbezi Luis","Msigani","Ubungo","Ununio"],
      "Kigamboni": ["Kigamboni","Kisarawe II","Mjimwema","Somangila","Tuamoyo"],
    }
  },
  "Arusha": {
    jurisdiction: "mainland",
    districts: {
      "Arusha City":  ["Daraja Mbili","Elerai","Kimandolu","Levolosi","Moshono","Ngarenaro","Olasiti","Sekei","Sombetini","Themi"],
      "Meru":         ["Arusha Urban","Burka","Kikatiti","Mwandet","Nduruma","Ngaramtoni","Poli","Songoro","Usa River"],
      "Monduli":      ["Esilalei","Engutoto","Kitumbeine","Lepurko","Lolkisale","Monduli Juu","Mto wa Mbu","Nanja"],
      "Ngorongoro":   ["Alailelai","Digodigo","Endulen","Kakesio","Malambo","Nainokanoka","Olbalbal","Sale"],
      "Longido":      ["Gelai Meru","Kimokouwa","Lalarasi","Longido","Mateves","Ngereyani"],
      "Karatu":       ["Ayalabe","Bashay","Endabash","Karatu","Mbulumbulu","Oldeani","Rhotia"],
    }
  },
  "Dodoma": {
    jurisdiction: "mainland",
    districts: {
      "Dodoma City": ["Chamwino","Ipagala","Kikuyu","Kikombo","Makulu","Matumbulu","Nzuguni","Veyula"],
      "Bahi":        ["Bahi","Buigiri","Chipanga","Ibihwa","Mwitikira","Njoge","Nondwa"],
      "Chamwino":    ["Buigiri","Hombolo","Idifu","Ikowa","Ihumwa","Imagi","Kizota","Matumbulu"],
      "Chemba":      ["Chemba","Chipanga","Farkwa","Mwaikisabe","Mwakisabe","Sangasanga","Shelui"],
      "Kondoa":      ["Bereko","Haubi","Itolwa","Kolo","Kondoa","Kwamtoro","Mkuyu","Mondo"],
      "Mpwapwa":     ["Godegode","Kibakwe","Lupeta","Makutapora","Mpwapwa","Rudi","Wotta"],
    }
  },
  "Mwanza": {
    jurisdiction: "mainland",
    districts: {
      "Ilemela":   ["Buswelu","Igogo","Kiloleli","Kirumba","Mkolani","Nyamagana","Sangabuye"],
      "Nyamagana": ["Bwiru","Isamilo","Mahina","Mirongo","Nyegezi","Pamba","Pasiansi"],
      "Magu":      ["Igalla","Kanyelele","Lubugu","Magu","Ng'haya","Nyanguge","Sukuma"],
      "Kwimba":    ["Hungumalwa","Isagehe","Magu","Ngudu","Nkuyu","Sumve","Viseke"],
      "Sengerema": ["Buhongwa","Igalagala","Igoma","Kabila","Nyampande","Sengerema","Wampembe"],
      "Ukerewe":   ["Bwisya","Gabanye","Murutunguru","Namilembe","Nansio","Ukara"],
    }
  },
  "Mbeya": {
    jurisdiction: "mainland",
    districts: {
      "Mbeya City": ["Iyela","Kalobe","Mwansekwa","Nsalaga","Sisimba","Uyole"],
      "Chunya":     ["Chunya","Galula","Jombo","Lupa","Matundasi","Sangilo"],
      "Kyela":      ["Ipinda","Itande","Kyela","Lulindi","Masoko","Ndali"],
      "Mbarali":    ["Chimala","Igawa","Madibira","Mbarali","Rujewa","Utengule"],
      "Rungwe":     ["Bulyaga","Isongole","Kiwira","Mwakaleli","Rungwe","Tukuyu"],
      "Busokelo":   ["Busokelo","Ikuti","Ilembo","Isange","Kikondo","Mbangala"],
    }
  },
  "Tanga": {
    jurisdiction: "mainland",
    districts: {
      "Tanga City": ["Chumbageni","Duga","Makorora","Ngamiani","Pande","Tanga"],
      "Handeni":    ["Handeni","Kimbe","Kwasunga","Magamba","Mkata","Segera"],
      "Kilindi":    ["Kilindi","Kwediboma","Lushoto","Magamba","Mazinde","Ngua"],
      "Korogwe":    ["Bungu","Dindira","Korogwe","Lusanga","Mkomazi","Mkumbara"],
      "Lushoto":    ["Gare","Lushoto","Mlola","Mlowo","Shume","Ubiri","Vuga"],
      "Muheza":     ["Amani","Bombani","Kigombe","Maramba","Muheza","Tongoni"],
      "Pangani":    ["Boza","Kipumbwi","Madanga","Mkwaja","Pangani","Ushongo"],
    }
  },
  "Kilimanjaro": {
    jurisdiction: "mainland",
    districts: {
      "Moshi Urban": ["Bondeni","Kaloleni","Karanga","Mji Mwema","Rau","Soweto"],
      "Moshi Rural": ["Kirua Vunjo East","Kirua Vunjo West","Mamba","Mengwe","Msae","Old Moshi"],
      "Hai":         ["Bombo","Kibosho","Kilema","Machame","Masama","Uru"],
      "Mwanga":      ["Kihurio","Lembeni","Mwanga","Njoro","Rundugai","Same"],
      "Same":        ["Chome","Gonja","Hedaru","Kihurio","Mamba","Vunta"],
      "Rombo":       ["Mkuu","Nanjara","Rongai","Usangi"],
      "Siha":        ["Gararagua","Kilimanjaro","Londoto","Mawenzi","Siha"],
    }
  },
  "Morogoro": {
    jurisdiction: "mainland",
    districts: {
      "Morogoro Urban": ["Boma","Chamwino","Kihonda","Kilakala","Mji Mkuu","Mzumbe","Sabasaba"],
      "Kilosa":         ["Gairo","Kilosa","Kimamba","Lumuma","Malangali","Msowero","Rudewa"],
      "Kilombero":      ["Ifakara","Igawa","Lupiro","Mngeta","Mofu","Signali"],
      "Ulanga":         ["Idunda","Lupiro","Mahenge","Minepa","Vigoi"],
      "Mvomero":        ["Hembeti","Kanga","Mgeta","Mlali","Mvomero","Turiani"],
      "Gairo":          ["Gairo","Idodi","Ilakala","Nongwe","Rudewa"],
    }
  },
  "Kagera": {
    jurisdiction: "mainland",
    districts: {
      "Bukoba Urban": ["Hamugembe","Kagera","Kahororo","Komurugyendo","Nyakato"],
      "Bukoba Rural": ["Izigo","Katoro","Kiziba","Maruku","Rubale"],
      "Biharamulo":   ["Biharamulo","Buliga","Lusahunga","Murusagamba","Nyantira"],
      "Karagwe":      ["Bweranyange","Chato","Kayanga","Kimuli","Rutobo"],
      "Muleba":       ["Buhendangabo","Ijumbi","Muleba","Nshamba","Rubale"],
      "Ngara":        ["Bugarama","Kibimba","Murusagamba","Ngara","Rulenge"],
      "Missenyi":     ["Bunazi","Kaisho","Kiruruma","Mutukula","Nsunga"],
    }
  },
  "Mara": {
    jurisdiction: "mainland",
    districts: {
      "Musoma Urban": ["Bweri","Makoko","Musoma","Nyamagaro","Nyasho"],
      "Musoma Rural": ["Bisurura","Butiama","Kiabakari","Mugango","Nasa","Nyamtinga"],
      "Bunda":        ["Bunda","Kibara","Kisorya","Nyamagaro","Sarawe"],
      "Rorya":        ["Kirogo","Komuge","Nyamagaro","Rorya","Shirati"],
      "Serengeti":    ["Borenga","Ikorongo","Mugumu","Nata","Robanda"],
      "Tarime":       ["Gorowa","Komuge","Nyancha","Sirari","Tarime"],
    }
  },
  "Manyara": {
    jurisdiction: "mainland",
    districts: {
      "Babati Urban": ["Babati","Dareda","Gallapo","Gidas","Haraa","Mamire"],
      "Babati Rural": ["Arri","Bashnet","Gichameda","Magugu","Nangwa","Seloto"],
      "Hanang":       ["Dabil","Dirma","Gidahababieg","Katesh","Laghanga","Mureru"],
      "Kiteto":       ["Dosidosi","Kibaya","Kimana","Laiseri","Lolkisale","Ngorika"],
      "Mbulu":        ["Dongobesh","Giting","Haydom","Maghang","Mbulu","Tumati"],
      "Simanjiro":    ["Emboreet","Loiborsireet","Naberera","Ngorika","Orkesumet"],
    }
  },
  "Tabora": {
    jurisdiction: "mainland",
    districts: {
      "Tabora Urban": ["Cheyo","Gongoni","Isevya","Nzovwe","Tabora"],
      "Igunga":       ["Igunga","Igurubi","Itigi","Mwamashele","Nzega"],
      "Kaliua":       ["Kaliua","Kaswa","Nsenda","Ulyankulu","Uyui"],
      "Nzega":        ["Bukene","Itobo","Nzega","Puge","Ziba"],
      "Sikonge":      ["Igagala","Sikonge","Usesula","Utende","Vumilia"],
      "Urambo":       ["Goweko","Sitatala","Urambo","Usoke","Vumilia"],
    }
  },
  "Kigoma": {
    jurisdiction: "mainland",
    districts: {
      "Kigoma Urban": ["Gungu","Kagera","Kigoma","Maweni","Mwanga"],
      "Buhigwe":      ["Buhigwe","Kandwi","Mabamba","Muyama","Rugalama"],
      "Kakonko":      ["Kakonko","Kasanda","Kazuramimba","Mabamba","Murungu"],
      "Kibondo":      ["Kakonko","Kibondo","Kilagala","Mabamba","Murungu"],
      "Kasulu":       ["Kasulu","Kitagata","Lugufu","Makere","Mugunzu"],
      "Uvinza":       ["Ilagala","Kigoma","Lugufu","Uvinza","Vikonge"],
    }
  },
  "Singida": {
    jurisdiction: "mainland",
    districts: {
      "Singida Urban": ["Isikizya","Mughamo","Mwankali","Singida","Utemini"],
      "Ikungi":        ["Ihanja","Ikungi","Mughunga","Mtinko","Sepuka"],
      "Iramba":        ["Iguguno","Kinyeto","Kiomboi","Mwanga","Shelui"],
      "Manyoni":       ["Chunya","Lola","Makanda","Manyoni","Miyuji"],
      "Mkalama":       ["Kinampanda","Mkalama","Nduguti","Ntuntu","Urughu"],
    }
  },
  "Rukwa": {
    jurisdiction: "mainland",
    districts: {
      "Sumbawanga Urban": ["Chanji","Kasanga","Kasu","Nkundi","Ntulika","Sumbawanga"],
      "Sumbawanga Rural": ["Chala","Matai","Milepa","Nankanga","Ninde","Nkundi"],
      "Kalambo":          ["Isale","Kalambo","Kasanga","Ntendo","Sumbu"],
      "Nkasi":            ["Kirando","Nkasi","Nzovwe","Sintali","Wampembe"],
    }
  },
  "Ruvuma": {
    jurisdiction: "mainland",
    districts: {
      "Songea Urban": ["Mshangano","Ruvuma","Songea","Sumawe","Ukwavila"],
      "Namtumbo":     ["Kigonsera","Lilambo","Namtumbo","Nampungu","Namasakata"],
      "Nyasa":        ["Liuli","Mbamba Bay","Mkako","Nyasa","Tingi"],
      "Tunduru":      ["Majimaji","Nalasi","Namasakata","Tunduru","Ungoni"],
      "Mbinga":       ["Amani","Maguu","Mbinga","Mbinga Urban","Ngima"],
    }
  },
  "Lindi": {
    jurisdiction: "mainland",
    districts: {
      "Lindi Urban": ["Lindi","Minazini","Mvae","Ng'apa","Rasbura"],
      "Kilwa":       ["Kilwa Kivinje","Kilwa Masoko","Mandawa","Nanjirinji","Njinjo"],
      "Liwale":      ["Liwale","Nanganga","Nnasi","Nyengedi","Liwale Kaskazini"],
      "Nachingwea":  ["Mnolela","Nachingwea","Naipanga","Nanganga","Ruponda"],
      "Ruangwa":     ["Mbekenyera","Nakapanya","Nandete","Ruangwa"],
    }
  },
  "Mtwara": {
    jurisdiction: "mainland",
    districts: {
      "Mtwara Urban": ["Chuno","Magomeni","Mtwara","Mtawala","Shangani"],
      "Masasi":       ["Chipuputa","Dihimba","Lilombe","Masasi","Mkwera"],
      "Nanyumbu":     ["Chiungutwa","Hanga","Mangaka","Nanyumbu","Napacho"],
      "Newala":       ["Chikonji","Kitangari","Mahuta","Newala","Tandahimba"],
      "Tandahimba":   ["Chikukwe","Mikindani","Nanyamba","Tandahimba"],
    }
  },
  "Pwani": {
    jurisdiction: "mainland",
    districts: {
      "Bagamoyo":  ["Bagamoyo","Dunda","Kaole","Kikoka","Kiromo","Mapinga"],
      "Kibaha":    ["Kibaha","Kwala","Mlandizi","Ruvu","Soga"],
      "Kisarawe":  ["Bunju","Kisarawe","Kurui","Masaki","Mtamba"],
      "Mafia":     ["Bweni","Jibondo","Kilindoni","Kiegeani","Kirongwe"],
      "Mkuranga":  ["Bunju","Kisiju","Mkuranga","Msanga","Vikindu"],
      "Rufiji":    ["Bungu","Ikwiriri","Kibiti","Mbunju","Ndundu"],
    }
  },
  "Simiyu": {
    jurisdiction: "mainland",
    districts: {
      "Bariadi":  ["Bariadi","Mhango","Nguliguli","Nkoma","Seke"],
      "Busega":   ["Busega","Dutwa","Kabondo","Malampaka","Mwamala"],
      "Itilima":  ["Igowole","Itilima","Lembeni","Maleli","Mwanyahina"],
      "Maswa":    ["Gumali","Maswa","Mwanhuzi","Nyashimo","Shishiyu"],
      "Meatu":    ["Dutwa","Mwigumbi","Meatu","Mwandoya","Nyang'hwale"],
    }
  },
  "Geita": {
    jurisdiction: "mainland",
    districts: {
      "Geita":       ["Buhalamuli","Geita","Igombe","Kalangalala","Katoro"],
      "Bukombe":     ["Bukombe","Bunegezi","Iglika","Magungu","Namonge"],
      "Chato":       ["Biharamulo","Chato","Isenyi","Kasato","Murutunguru"],
      "Mbogwe":      ["Buseresere","Kasanda","Mbogwe","Ngemo","Nyamarunda"],
      "Nyang'hwale": ["Bulela","Igembe","Kahama","Nyang'hwale","Nyarugusu"],
    }
  },
  "Njombe": {
    jurisdiction: "mainland",
    districts: {
      "Njombe Urban": ["Igima","Kibena","Mjimwema","Njombe","Ununio"],
      "Makete":       ["Ikama","Lufumbu","Makete","Matamba","Mkiu"],
      "Njombe Rural": ["Igominyi","Lupembe","Njombe","Ukwama","Ulembwe"],
      "Wanging'ombe": ["Igawa","Kibena","Mlangali","Udzungwa","Wanging'ombe"],
    }
  },
  "Katavi": {
    jurisdiction: "mainland",
    districts: {
      "Mpanda Urban": ["Karema","Mpanda","Mwese","Nsimbo","Sibwesa"],
      "Mpanda Rural": ["Ikola","Kabungu","Karema","Lagosa","Mpanda"],
      "Mlele":        ["Bambu","Katavi","Mwambani","Nsimbo","Ugalla"],
    }
  },
  "Songwe": {
    jurisdiction: "mainland",
    districts: {
      "Mbozi":    ["Igamba","Mbozi","Mpemba","Iyula","Vwawa"],
      "Momba":    ["Chilulumo","Jangalo","Momba","Msangano","Ndalambo"],
      "Ileje":    ["Bulumbi","Ileje","Itumba","Ngana","Penja"],
      "Songwe":   ["Isangati","Mlowo","Songwe","Tunduma","Vwawa"],
    }
  },
  "Iringa": {
    jurisdiction: "mainland",
    districts: {
      "Iringa Urban": ["Gangilonga","Iringa","Mkimbizi","Mlandege","Tosamaganga"],
      "Iringa Rural": ["Idodi","Ipalamwa","Ismani","Mafinga","Nduli"],
      "Kilolo":       ["Dabaga","Ilula","Kilolo","Nyangolo","Ukwega"],
      "Mufindi":      ["Igowole","Mafinga","Mufindi","Nyigo","Sadani"],
    }
  },
  "Shinyanga": {
    jurisdiction: "mainland",
    districts: {
      "Shinyanga Urban": ["Chamwino","Ibadakuli","Shinyanga","Tinde","Udadi"],
      "Shinyanga Rural": ["Ibadakuli","Kagongwa","Kiloleli","Mwakata","Tinde"],
      "Kahama":          ["Bugarama","Isaka","Kahama","Mhama","Nyandekwa"],
      "Kishapu":         ["Busolwa","Dutwa","Kishapu","Lalago","Mwadui"],
    }
  },
  // ── ZANZIBAR ─────────────────────────────────────────────
  "Zanzibar North": {
    jurisdiction: "zanzibar",
    districts: {
      "Kaskazini A": ["Chaani","Mahonda","Mkwajuni","Pongwe","Pwani ya Kaskazini"],
      "Kaskazini B": ["Bumbwini","Kilimahewa","Mkwajuni","Nungwi","Tumbatu"],
    }
  },
  "Zanzibar South": {
    jurisdiction: "zanzibar",
    districts: {
      "Kusini":  ["Fumba","Koani","Mwanakwerekwe","Tunguu","Uzi"],
      "Kati":    ["Bwejuu","Donge","Jozani","Kae","Pete"],
    }
  },
  "Zanzibar West": {
    jurisdiction: "zanzibar",
    districts: {
      "Mjini":        ["Darajani","Forodhani","Kwahani","Mji Mkongwe","Stone Town"],
      "Magharibi A":  ["Bububu","Chukwani","Kinazini","Kiwengwa","Mwanakwerekwe"],
      "Magharibi B":  ["Bambao","Chwaka","Kiembesamaki","Ndijani","Zanzibar Rural"],
    }
  },
  "Pemba North": {
    jurisdiction: "zanzibar",
    districts: {
      "Micheweni": ["Chambani","Fundo","Konde","Kojani","Mapofu"],
      "Wete":      ["Fundo","Ng'ambwa","Ole","Tumbe","Wete"],
    }
  },
  "Pemba South": {
    jurisdiction: "zanzibar",
    districts: {
      "Chake Chake": ["Chake Chake","Madungu","Mkoani","Mtambwe","Pujini"],
      "Mkoani":      ["Gando","Kengeja","Mkoani","Mtambwe Kusini","Vitongoji"],
    }
  },
}

// Helper functions
export const getRegions = () => Object.keys(TZ_GEO)
export const getRegionsByJurisdiction = (j) =>
  Object.entries(TZ_GEO).filter(([,v]) => j==='national' || v.jurisdiction===j).map(([k]) => k)
export const getDistricts = (region) =>
  region && TZ_GEO[region] ? Object.keys(TZ_GEO[region].districts) : []
export const getVillages = (region, district) =>
  region && district && TZ_GEO[region]?.districts[district] ? TZ_GEO[region].districts[district] : []
export const getJurisdiction = (region) => TZ_GEO[region]?.jurisdiction || 'mainland'
