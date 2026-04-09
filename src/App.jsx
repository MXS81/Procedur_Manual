import { useEffect } from 'react'
import { ManualProvider, useManualContext } from './store/ManualContext'
import ManualLibraryPage from './pages/ManualLibraryPage'
import SearchPage from './pages/SearchPage'
import ReaderPage from './pages/ReaderPage'
import ContextMenuHost from './components/ContextMenuHost'
import './App.css'

function AppRouter () {
  const { currentPage, pageData, navigate, notification } = useManualContext()

  useEffect(() => {
    if (!window.utools) return
    window.utools.onPluginEnter((action) => {
      if (action.code.startsWith('manual-quick-')) {
        const manualId = action.code.replace('manual-quick-', '')
        const query = action.type === 'over' ? (action.payload || '') : ''
        navigate('reader', {
          manualId,
          quickSearch: query
        })
        return
      }
      switch (action.code) {
        case 'manual-home':
          navigate('library')
          break
        case 'manual-search':
          navigate('search', { query: action.type === 'over' ? action.payload : '' })
          break
        case 'manual-file-import':
          if (action.type === 'files' && action.payload?.[0]) {
            navigate('library', { importFile: action.payload[0].path })
          } else {
            navigate('library')
          }
          break
        default:
          navigate('library')
      }
    })
    window.utools.onPluginOut(() => {})
  }, [navigate])

  let page
  switch (currentPage) {
    case 'search':
      page = <SearchPage initialQuery={pageData?.query} />
      break
    case 'reader':
      page = <ReaderPage {...(pageData || {})} />
      break
    default:
      page = <ManualLibraryPage importFilePath={pageData?.importFile} />
  }

  return (
    <div className="app">
      <ContextMenuHost />
      {notification && (
        <div className={`toast toast-${notification.type}`}>
          {notification.message}
        </div>
      )}
      {page}
    </div>
  )
}

export default function App () {
  return (
    <ManualProvider>
      <AppRouter />
    </ManualProvider>
  )
}
