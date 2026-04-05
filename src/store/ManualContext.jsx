import { createContext, useContext, useReducer, useCallback, useEffect } from 'react'

const ManualContext = createContext(null)

const initialState = {
  manuals: [],
  loading: true,
  currentPage: 'library',
  pageData: null,
  notification: null
}

function reducer (state, action) {
  switch (action.type) {
    case 'SET_MANUALS':
      return { ...state, manuals: action.payload, loading: false }
    case 'ADD_MANUAL':
      return { ...state, manuals: [...state.manuals, action.payload] }
    case 'UPDATE_MANUAL':
      return {
        ...state,
        manuals: state.manuals.map(m =>
          m.id === action.payload.id ? { ...m, ...action.payload } : m
        )
      }
    case 'REMOVE_MANUAL':
      return { ...state, manuals: state.manuals.filter(m => m.id !== action.payload) }
    case 'REMOVE_MANUALS': {
      const idSet = new Set(action.payload)
      return { ...state, manuals: state.manuals.filter(m => !idSet.has(m.id)) }
    }
    case 'NAVIGATE':
      return { ...state, currentPage: action.payload.page, pageData: action.payload.data || null }
    case 'NOTIFY':
      return { ...state, notification: action.payload }
    case 'CLEAR_NOTIFY':
      return { ...state, notification: null }
    default:
      return state
  }
}

export function ManualProvider ({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    try {
      try { window.services?.initBuiltinManuals() } catch (e) {
        console.warn('Built-in manuals init skipped:', e.message)
      }
      const manuals = window.services?.getAllManuals() || []
      for (const m of manuals) {
        if (m.indexStatus === 'ready') {
          const data = window.services?.loadIndexData(m.id)
          if (!data) {
            m.indexStatus = 'none'
            m.docCount = 0
            try { window.services.saveManual({ id: m.id, indexStatus: 'none', docCount: 0 }) } catch {}
          }
        }
      }
      dispatch({ type: 'SET_MANUALS', payload: manuals })
      try { window.services?.syncManualFeatures() } catch (e) {
        console.warn('syncManualFeatures skipped:', e.message)
      }
    } catch (e) {
      console.error('Failed to load manuals:', e)
      dispatch({ type: 'SET_MANUALS', payload: [] })
    }
  }, [])

  const navigate = useCallback((page, data) => {
    dispatch({ type: 'NAVIGATE', payload: { page, data } })
  }, [])

  const notify = useCallback((message, type = 'info') => {
    dispatch({ type: 'NOTIFY', payload: { message, type } })
    setTimeout(() => dispatch({ type: 'CLEAR_NOTIFY' }), 3000)
  }, [])

  const addManual = useCallback((manual) => {
    window.services.saveManual(manual)
    dispatch({ type: 'ADD_MANUAL', payload: manual })
    try { window.services.syncManualFeatures() } catch {}
  }, [])

  const updateManual = useCallback((updates) => {
    window.services.saveManual(updates)
    dispatch({ type: 'UPDATE_MANUAL', payload: updates })
    try { window.services.syncManualFeatures() } catch {}
  }, [])

  const removeManual = useCallback((id) => {
    window.services.removeManual(id)
    dispatch({ type: 'REMOVE_MANUAL', payload: id })
    try { window.services.syncManualFeatures() } catch {}
  }, [])

  const removeManuals = useCallback((ids) => {
    if (!ids?.length) return
    window.services.removeManuals(ids)
    dispatch({ type: 'REMOVE_MANUALS', payload: ids })
    try { window.services.syncManualFeatures() } catch {}
  }, [])

  return (
    <ManualContext.Provider value={{
      ...state, dispatch, navigate, notify, addManual, updateManual, removeManual, removeManuals
    }}>
      {children}
    </ManualContext.Provider>
  )
}

export function useManualContext () {
  const ctx = useContext(ManualContext)
  if (!ctx) throw new Error('useManualContext must be inside ManualProvider')
  return ctx
}
