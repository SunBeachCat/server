const Joi = require('joi'),
  uuid = require('uuid/v4'),
  Router = require('koa-router'),
  passport = require('koa-passport'),
  db = require('../helpers/db'),
  { check, isSelfOp } = require('../helpers/auth'),
  { getNow, isEarly } = require('../helpers/date'),
  { createMsg } = require('../helpers/msgHelper'),
  { testReq } = require('../helpers/taskHelper'),
  { creaditChange } = require('../helpers/userHelper')


const orderDB = db.get('Order')
const taskDB = db.get('Task')
const userDB = db.get('Person')

const orderRouter = new Router({ prefix: '/order' })
orderRouter
  .post('/create', check, createOrder)
  .get('/all', check, getAllOrder)
  .get('/bytask/:id', check, getAllOrderOfTask)
  .get('/cancelself/:id', check, cancelSelfOrder)
  .get('/finish/:id', check, finishOrder)
  .get('/get/:id', check, getOrderbyID)
  //.get('/enroll',         check,  signupTask)
  //.get('/status/finish/:id',    check,  isSelfOp, setTaskFinish)
  .get('/status/ongoing/:id', check, setOnGoing)
  //.get('/status/start/:id',     check,  isSelfOp, setTaskStart)
  .get('/status/pending/:id', check, setOrderPending)
  .post('/accomplish', check, orderAccomplish)


// Task schema
const orderSchema = Joi.object().keys({
  tid: Joi.string().trim().required(),
  status: Joi.string().trim()
});

/**
 * @example curl -XPOST "http://localhost:8081/order/create" -d '{uid:"xxx",tid:"xxx",}' -H 'Content-Type: application/json'
 * oid tid status uid createTime message price
 */
async function createOrder(ctx, next) {
  let passdata = await Joi.validate(ctx.request.body, orderSchema)
  let task = await taskDB.findOne({ tid: passdata.tid }).then((doc) => { return doc })
  if (task.status === "已结束") {
    ctx.body = { status: 'failure' }
  }
  else if (ctx.state.user[0].uid === task.uid) {
    ctx.body = { status: "same uid in create order" }
  }
  else {
    if (task.currentParticipator < task.participantNum) {
      let temp = await taskDB.findOneAndUpdate({ tid: passdata.tid }, { $set: { currentParticipator: task.currentParticipator + 1 } }).then((doc) => { return doc })
      // let passdata=ctx.request.body
      passdata.createTime = getNow()
      let makeStatus = await testReq(passdata.tid, passdata.createTime)
      if (makeStatus !== -1) {
        passdata.oid = uuid()
        passdata.uid = ctx.state.user[0].uid
        passdata.status = 'success'
        passdata.price = makeStatus

        let owner = await userDB.findOne({ uid: ctx.state.user[0].uid }).then((doc) => { return doc })

        await orderDB.insert(passdata)
        await createMsg(task.uid, ctx.state.user[0].uid, task.type, "您的任务" + task.title + "有新的参与者" + owner.nickname)
        await createMsg(ctx.state.user[0].uid, task.uid, task.type, "您已成功登记为" + task.title + "任务的参与人员。")

        ctx.body = { status: 'success' }
        ctx.status = 200
        await next()
      }
      else {
        ctx.body = { status: 'fail' }
        ctx.status = 400
        await next()
      }
    }

    else {
      let temp = await taskDB.findOneAndUpdate({ tid: passdata.tid }, { $set: { candidate: task.candidate + 1 } }).then((doc) => { return doc })
      // let passdata=ctx.request.body
      passdata.createTime = getNow()
      passdata.oid = uuid()
      passdata.uid = ctx.state.user[0].uid
      passdata.status = 'pending'
      passdata.price = temp.salary
      let owner = await userDB.findOne({ uid: ctx.state.user[0].uid }).then((doc) => { return doc })

      await orderDB.insert(passdata)
      await createMsg(task.uid, ctx.state.user[0].uid, task.type, "您的任务" + task.title + "有新的报名者" + owner.nickname + "，请移步至“任务中心”查看任务报名详情。")
      await createMsg(ctx.state.user[0].uid, task.uid, task.type, "您已成功报名" + task.title + "任务，现在登记您为报名者。")

      ctx.body = { status: 'pending' }
      ctx.status = 200
      await next()
    }
  }
}


/**
 * @example curl -XPOST "http://localhost:8081/order/enroll" -d '{uid:"xxx",tid:"xxx",}' -H 'Content-Type: application/json'
 * oid tid status uid createTime message price
 */
async function signupTask(ctx, next) {
  let passdata = await Joi.validate(ctx.request.body, orderSchema)
  let repeat =
    await orderDB.findOne({ uid: ctx.state.user[0].uid, tid: passdata.tid })
      .then((doc) => { if (doc.length === 0) return false; else return true; })
  if (repeat) {
    ctx.body = { status: 'failure' }
  }
  else {
    let task = await taskDB.findOne({ tid: passData.tid }).then((doc) => { return doc })
    if (task.status === "已结束" || task.status === "进行中") {
      ctx.body = { status: 'failure' }
      await next()
    }
    else {
      // let passdata=ctx.request.body
      passdata.createTime = getNow()
      let makeStatus = await testReq(passdata.tid, passdata.createTime)
      if (makeStatus !== -1) {
        passdata.oid = uuid()
        passdata.uid = ctx.state.user[0].uid
        passdata.status = 'pending'
        passdata.price = makeStatus

        await orderDB.insert(passdata)
        await createMsg(ctx.request.body.uid, ctx.state.user[0].uid, task.type, "有新的报名者")

        ctx.body = { status: 'pending' }
        ctx.status = 200
        await next()
      }
      else {
        ctx.body = { status: 'fail' }
        ctx.status = 400
        await next()
      }
    }
  }
}

async function finishOrder(ctx, next) {
  res = await orderDB.findOneAndUpdate({ tid: ctx.params.id }, { $set: { status: 'finish' } })
    .then((doc) => { return true })
  let orderObj = await orderDB.findOne({ tid: ctx.params.id })
    .then((doc) => { return doc })
  let taskObj = await taskDB.findOne({ tid: orderObj.tid }).then((doc) => { return doc })
  let user = await userDB.findOne({ uid: ctx.state.user[0].uid }).then((doc) => { return doc })
  if (res) {
    await createMsg(taskObj.uid, orderObj.uid, taskObj.type, "参与者" + user.nickname + "完成了您发布的" + taskObj.title + "任务")
    ctx.body = { status: 'success' }
    ctx.status = 200
  }
  else {
    ctx.body = { status: 'failed' }
    ctx.status = 400
  }
  await next()
}

async function getOrderbyID(ctx, next) {
  res = await orderDB.findOne({ oid: ctx.params.id }).then((doc) => { return doc })
  if (res.uid === ctx.state.user[0].uid) {
    ctx.body = res
    ctx.status = 200
    console.log('get order success :83')
  }
  else {
    ctx.body = { status: 'fail' }
    ctx = status = 400
    console.log('get order fail :88')
  }
  await next()
}


/**
* @example curl -XGET "http://localhost:8081/order/all"
*/
async function getAllOrder(ctx, next) {
  ctx.body = await orderDB.find({ uid: ctx.state.user[0].uid }).then((docs) => { return docs })
  await next();
}

async function getAllOrderOfTask(ctx, next) {
  ctx.body = await orderDB.find({ tid: ctx.params.id }).then((docs) => { return docs })
  await next();
}

/**
* @example curl -XGET "http://localhost:8081/task/cancel/:id"
* Todo : Money operations.
*/
async function cancelSelfOrder(ctx, next) {
  orderRes = await orderDB.findOne({ oid: ctx.params.id, uid: ctx.state.user[0].uid }).then((doc) => { return doc })
  if (orderRes.status === 'pending') {
    taskRes = await taskDB.findOne({ tid: orderRes.tid }).then((doc) => { return doc })
    now = getNow()
    await orderDB.findOneAndUpdate({ oid: orderRes.oid }, { $set: { status: 'expired' } })
    if (isEarly(now, taskRes.beginTime)) {
      createMsg(taskRes.uid, ctx.state.user[0].uid, taskRes.type, '有人退出了project')
    }
    else if (isEarly(taskRes.expireTime, now)) {
      createMsg(taskRes.uid, ctx.state.user[0].uid, taskRes.type, '有人退出了project,并被扣分')
      creaditChange(ctx.state.user[0].uid, 1)  //decrease credit
    }
    ctx.status = 200;
    ctx.body = { status: 'success' }
  }
  else {
    ctx.status = 40;
    ctx.body = { status: 'fail' }
  }
  await next();
}

/**
 * @example curl -XGET "http://localhost:8081/task/pending/:id"
 */
async function setOrderPending(ctx, next) {
  let orderObj = await orderDB.findOne({ oid: ctx.params.id }).then((doc) => { return doc })
  let taskObj = await taskDB.findOne({ tid: orderObj.tid }).then((doc) => { return doc })
  if (taskObj.status === "已结束") {
    ctx.body = { status: 'failure' }
    await next()
  }
  else if (res.status === 'pending') {
    ctx.body = { status: 'failure' }
    await next()
  }
  else {
    let task = await taskDB.findOneAndUpdate({ tid: orderObj.tid }, { $set: { currentParticipator: taskObj.currentParticipator - 1 } }, { $set: { candidate: taskObj.candidate + 1 } }).then((doc) => { return doc })

    res = await orderDB.findOneAndUpdate({ tid: ctx.params.id }, { $set: { status: "pending" } }).then((doc) => { return doc })
    await createMsg(res.uid, taskObj.uid, taskObj.type, "您报名的" + taskObj.title + "任务已将您转为候补，请等待转正后再完成任务。")
    res.status = "pending"
    ctx.body = res.status
    ctx.status = 201
    console.log(res)
    await next()
  }
}

/**
 * @example curl -XGET "http://localhost:8081/task/ongoing/:id"
 */
async function setOnGoing(ctx, next) {
  let orderObj = await orderDB.findOne({ oid: ctx.params.id }).then((doc) => { return doc })
  let taskObj = await taskDB.findOne({ tid: orderObj.tid }).then((doc) => { return doc })
  if (taskObj.status === "已结束") {
    ctx.body = { status: 'Task finished' }
    await next()
  }
  else if (taskObj.currentParticipator >= taskObj.participantNum) {
    ctx.body = { status: 'Max participator' }
    await next()
  }
  else if (orderObj.status !== 'pending') {
    ctx.body = { status: 'order status is not pending' }
    await next()
  }
  else {
    let task = await taskDB.findOneAndUpdate({ tid: orderObj.tid }, { $set: { currentParticipator: taskObj.currentParticipator + 1 } }, { $set: { candidate: taskObj.candidate - 1 } }).then((doc) => { return doc })
    res = await orderDB.findOneAndUpdate({ tid: ctx.params.id }, { $set: { status: "success" } }).then((doc) => { return doc })
    await createMsg(res.uid, taskObj.uid, taskObj.type, "您报名的" + taskObj.title + "任务的候补资格已被转正，请抓紧时机去完成任务吧！")
    res.status = "success"
    ctx.body = { status: 'success' }
    ctx.status = 201
    console.log(res)
    await next()
  }
}

/**
 * @example curl -XGET "http://localhost:8081/task/start/:id"
 */
async function setTaskStart(ctx, next) {
  res = await orderDB.findOneAndUpdate({ tid: ctx.params.id }, { $set: { status: "未开始" } }).then((doc) => { return doc })
  res.status = "未开始"
  ctx.body = res.status
  ctx.status = 201
  console.log(res)
  await next()
}

/**
 * @example curl -XPOST "http://localhost:8081/order/accomplish" -d '{oid:"xxx",finishNumber:"xxx",}' -H 'Content-Type: application/json'
 */
async function orderAccomplish(ctx, next) {
  let order = orderDB.findOne({ oid: ctx.request.body.oid }).then((doc) => { return doc })
  let task = taskDB.findOne({ tid: order.tid }).then((doc) => { return doc })
  if (ctx.request.body.finishNumber === task.finishNumber) {
    await transferFunc(order.tid, order.uid, order.price)
    res = orderDB.findOneAndUpdate({ oid: ctx.request.body.oid }, { $set: { status: "finish" } }).then((doc) => { return doc })
    ctx.body = { status: "finish" }
    ctx.status = 200
    createMsg(task.uid, order.uid, task.type, '您的' + task.title + '有一人完成任务了')
  }
  else {
    ctx.body = { status: "failure" }
    ctx.status = 400
  }
  await next()
}

module.exports = orderRouter
