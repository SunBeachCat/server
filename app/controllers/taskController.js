const Joi = require('joi'),
    uuid=require('uuid/v4'),
    Router = require('koa-router'),
    passport=require('koa-passport'),
    db=require('../helpers/db'),
    {check,isSelfOp}=require('../helpers/auth'),
    {getNow}=require('../helpers/date'),
    {_,createWallet,transferFunc}=require('./walletController')

// Task schema
const taskRegSchema = Joi.object().keys({
        title:Joi.string().min(4).max(60).trim().required(),
        type:Joi.string().required(),
        salary:Joi.number().integer().min(1).required(),
        description:Joi.string(),
        beginTime:Joi.date().min('now').required(),
        expireTime:Joi.date().min(Joi.ref('beginTime')).required(),
        participantNum:Joi.number().integer().min(1).required(),
        tags:Joi.string()
    });

const collection = db.get('Task')

const taskRouter=new Router({prefix:'/task'})
taskRouter
    .post('/create',         check,  createTask)
    .get('/all',             getAllTask)
    .get('/cancel/:id',      check,  isSelfOp,   cancelTask)




/**
 * @example curl -XPOST "http://localhost:8081/task/create" -d '{"title":"test task","type":"Questionaire","salary":"20","description":"task for test","beginTime":"8-20-2019","expireTime":"8-22-2019","participantNum":"1","tags":"Testing"}' -H 'Content-Type: application/json'
 * tid uid(organizer) type status createtime starttime endtime description location participantNum eachSalary tags
 */
async function createTask (ctx, next) {
    let passData = await Joi.validate(ctx.request.body, taskRegSchema)
    passData.uid=ctx.state.user[0].uid
    passData.tid=uuid()
    passData.status="start"
    passData.totalCost=passData.salary*passData.participantNum
    passData.createTime=getNow()
    console.log(passData)
    createWallet(passData.tid,true)
    transferFunc(passData.uid,passData.tid,passData.totalCost)
    ctx.body=await collection.insert(passData).then((doc)=>{return true})
    ctx.status = 201;
    await next();
}

/**
* @example curl -XGET "http://localhost:8081/task/all"
*/
async function getAllTask (ctx, next) {
    ctx.body=await collection.find().then((docs)=>{return docs})
    await next();
}

/**
* @example curl -XGET "http://localhost:8081/task/cancel/:id"
*/
async function cancelTask(ctx, next) {
  await collection.remove({tid:ctx.params.id,uid:ctx.state.user[0].uid});
  transferFunc(ctx.params.id,ctx.state.user[0].uid,passData.totalCost)
  ctx.status = 204;
  await next();
}


module.exports=taskRouter
