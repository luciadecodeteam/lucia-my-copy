import { useEffect, useState } from 'react'
import { auth, onIdTokenChanged } from '../firebase'
export function useAuthToken(){
  const [user,setUser]=useState(null)
  const [token,setToken]=useState('')
  useEffect(()=> onIdTokenChanged(auth, async(u)=>{ setUser(u||null); setToken(u? await u.getIdToken(): '') }),[])
  return { user, token }
}
