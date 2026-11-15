// TEST_ONLY UI fixture, never scientific data.
import {it,expect} from 'vitest';
import type {LocationsDataset} from '@shared/types/analog-location';
import {listSelectionOptions,resolveSelection,reconcileSelection,findLocationOption} from './selection';
it('preserves the second comparison for a shared Earth ID and rejects ambiguity',()=>{
 const earth={id:'earth',name:'Earth',body:'earth'};
 const ds={comparisons:['a','b'].map((id,i)=>({target:{id,name:id,body:'moon'},profile_id:'p'+i,analogs:[{location:earth,rank:1,similarity_score:90-i}]}))} as unknown as LocationsDataset;
 const options=listSelectionOptions(ds);const selection=options[3].selection;
 expect(resolveSelection(ds,selection)?.analog?.similarity_score).toBe(89);
 expect(findLocationOption(options,'earth')).toBeNull();
 expect(findLocationOption(options,'earth',ds.comparisons[1])?.comparison.target.id).toBe('b');
 expect(reconcileSelection(ds,selection)).toEqual(selection);
 ds.comparisons.push(ds.comparisons[1]);expect(resolveSelection(ds,selection)).toBeNull();
 ds.comparisons=ds.comparisons.slice(0,1);expect(reconcileSelection(ds,selection)?.locationId).toBe('a');
 ds.comparisons=[];expect(reconcileSelection(ds,selection)).toBeNull();
});
