const Router = require('koa-router'),
    combineRouters =require('koa-combine-routers'),
    userRouter = require('../controllers/indexController'),
    walletRouter=require('../controllers/walletController'),
    taskRouter=require('../controllers/taskController'),
    {
        renderIndex,
        renderTest
    }=require('../controllers/indexRender');

const indexRouter = new Router();
indexRouter
    .get('/',renderIndex)
    .get('/test',renderTest)

const router=combineRouters (
    userRouter,
    indexRouter,
    walletRouter,
    taskRouter
)
module.exports = router;
