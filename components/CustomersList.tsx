import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch } from '../redux/store';
import { selectors, thunks } from '../redux/slices';

export default function CustomersList() {
	const dispatch = useDispatch<AppDispatch>();
	const customers = useSelector(selectors.customers.selectAll);
	const loading = useSelector(selectors.customers.selectLoading);
	const error = useSelector(selectors.customers.selectError);

	useEffect(() => {
		dispatch(thunks.customers.fetchAll(undefined));
	}, [dispatch]);

	if (loading) return <div>Loading customers...</div>;
	if (error) return <div>Error: {error}</div>;

	return (
		<ul>
			{customers.map((c) => (
				<li key={(c as any).customer_id}>{(c as any).customer_name}</li>
			))}
		</ul>
	);
}


