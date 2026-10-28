import {db} from './store';
import {getJob} from './production';
import {text} from './production-contract';

// Topic entry must not reveal another owner's task, including shared test fixtures.
export async function findOwnerTopicJob(topicId:string,owner:string){
 const row=await db().prepare('SELECT id FROM production_jobs WHERE topic_id=? AND owner_id=?').bind(text(topicId,100),text(owner,100)).first<{id:string}>();
 return row?getJob(row.id,owner):null;
}
