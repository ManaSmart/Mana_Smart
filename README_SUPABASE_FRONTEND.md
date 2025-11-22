## Supabase + React + Redux Toolkit scaffolding

### Env

Create a `.env` (or `.env.local`) at project root with:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Folders

- `supabase/api/client.ts`: Supabase client init
- `supabase/models/*`: One interface per table
- `supabase/operations/crud.ts`: Generic CRUD helpers
- `redux/store.ts`: App store
- `redux/slices/crudSliceFactory.ts`: Generic CRUD slice factory
- `redux/slices/index.ts`: One slice per table, plus exported thunks/selectors
- `components/CustomersList.tsx`: Example component

### Usage

Wrap your app with `<Provider store={store}>` and render `CustomersList`.


