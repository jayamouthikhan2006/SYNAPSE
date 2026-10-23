import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'

const HI = {
  Dashboard: 'डैशबोर्ड', Institutions: 'संस्थान', Complaints: 'शिकायतें', 'Enforcement Actions': 'प्रवर्तन कार्रवाइयाँ',
  'ACE Alerts': 'ACE अलर्ट', 'Coordination Rooms': 'समन्वय कक्ष', 'Issue Threads': 'मुद्दा सूत्र', 'Reports & Analytics': 'रिपोर्ट व विश्लेषण',
  'File a Complaint': 'शिकायत दर्ज करें', 'Track Complaint': 'शिकायत ट्रैक करें', 'Audit Ledger': 'ऑडिट बही', 'Demo Guide': 'डेमो गाइड',
  Welcome: 'स्वागत है', 'Needs your attention': 'आपके ध्यान की आवश्यकता', 'Total institutions': 'कुल संस्थान', 'Open complaints': 'खुली शिकायतें',
  'Active enforcement actions': 'सक्रिय प्रवर्तन कार्रवाइयाँ', 'Open ACE alerts': 'खुले ACE अलर्ट', 'Complaints by bureau': 'ब्यूरो के अनुसार शिकायतें',
  'Monthly trend': 'मासिक रुझान', 'Institutions to watch': 'निगरानी वाले संस्थान', 'Recent ACE alerts': 'हाल के ACE अलर्ट',
  Search: 'खोजें', 'Viewing as': 'इस रूप में देखें', Overview: 'अवलोकन', Timeline: 'समयरेखा', Graph: 'ग्राफ़', Status: 'स्थिति', Priority: 'प्राथमिकता',
  Assign: 'सौंपें', 'View all': 'सभी देखें', 'Request Joint Review': 'संयुक्त समीक्षा का अनुरोध', 'Dismiss alert': 'अलर्ट खारिज करें',
}

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [meta, setMeta] = useState(null)
  const [role, setRoleState] = useState(() => { try { return localStorage.getItem('synapse.role') || 'RB' } catch { return 'RB' } })
  const [lang, setLangState] = useState(() => { try { return localStorage.getItem('synapse.lang') || 'en' } catch { return 'en' } })
  const [toast, setToast] = useState(null)
  useEffect(() => { api.get('/meta').then(setMeta).catch(() => setMeta(false)) }, [])
  const setRole = (r) => { try { localStorage.setItem('synapse.role', r) } catch { /* ignore */ } setRoleState(r) }
  const setLang = (l) => { try { localStorage.setItem('synapse.lang', l) } catch { /* ignore */ } setLangState(l) }
  const notify = (msg, kind = 'ok') => { setToast({ msg, kind, id: Math.random() }); setTimeout(() => setToast(null), 4200) }
  const t = (s) => (lang === 'hi' && HI[s]) || s
  const value = useMemo(() => ({ meta, role, setRole, lang, setLang, t, toast, notify }), [meta, role, lang, toast])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
