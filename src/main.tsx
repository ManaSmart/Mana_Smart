import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './globals.css'

import App from './App.tsx'
import { Provider } from 'react-redux'
import { store } from './redux-toolkit/store'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from './lib/queryClient'

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<Provider store={store}>
			<QueryClientProvider client={queryClient}>
				<App />
				<ReactQueryDevtools initialIsOpen={false} />
			</QueryClientProvider>
		</Provider>
	</StrictMode>,
)
