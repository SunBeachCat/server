const Joi = require('joi'),
    uuid=require('uuid/v4'),
    Router = require('koa-router'),
    passport=require('koa-passport'),
    db=require('../helpers/db'),
    {check,isSelfOp}=require('../helpers/auth'),
    {queryPerson}=require('../helpers/userHelper'),
    {queryBalance,createWallet}=require('../helpers/walletHelper')

// Simple user schema, more info: https://github.com/hapijs/joi
const userRegSchema = Joi.object().keys({
        username: Joi.string().alphanum().min(4).max(30).trim().required(),
        password:Joi.string().regex(/^[a-zA-Z0-9]{3,30}$/).required(),
        email: Joi.string().email({ minDomainSegments: 2, }).required(),
        phone:Joi.string().min(11).max(11).trim().required(),
        nickname:Joi.string().min(3).max(20).trim().required()
    });

//DB init
const personDB = db.get('Person')

const userRouter = new Router({prefix:'/users'});
userRouter
    .get('/',                   check,  list)
    .get('/self',               check,  getSelf)
    .get('/checkname/:name',    nameCanU)
    .get('/info/:id',           /*check,*/  getInfo)
    .get('/logout',             logoutUser)
    .get('/delete/:id',         check,  isSelfOp,   removeUser)
    .post('/reg',               registerUser)
    .post('/update',            check,  isSelfOp,   updateUser)
    .post('/login',             loginUser)
    .post('/rating',            rateUser)




//Passport
passport.serializeUser(function(user, done) {
    done(null, user._id.toString())
  })

passport.deserializeUser(async function(id, done) {
    personDB.find({_id:id}, done);
})

const LocalStrategy = require('passport-local').Strategy
passport.use(new LocalStrategy(async function(username, password, done) {
    user=await personDB.find({ username: username, password: password}).then((doc)=>{return doc})
    if(user.length===1)
    {
      done(null,user[0])
    }
    else
    {
      done(null,false)
    }
}))



/**
 * @example curl -XGET "http://localhost:8081/users/self"
 */
async function getSelf (ctx, next) {
    ctx.body=await personDB
        .findOne({uid:ctx.state.user[0].uid})
        .then((doc)=>{return doc})
    ctx.body.balance=await queryBalance(ctx.state.user[0].uid)
    await next()
}


/**
 *
 * @example curl -XGET "localhost:8081/users/check/:name"
 */
async function nameCanU(ctx,next){
    ctx.body=await personDB.find({username: ctx.params.name}).then((doc) => {
        if (doc.length>0) {
            return false
        }
        else{
            return true
        }})
    ctx.status = 200;
    await next()
}


/**
* @example curl -XGET "http://localhost:8081/users"
*/
async function list (ctx, next) {
    ctx.body=await personDB.find().then((docs)=>{return docs})
    await next();
}


/**
 * @example
 * curl -XPOST "http://localhost:8081/users/reg" -d '{"name":"New record 1"}' -H 'Content-Type: application/json'
 */
async function registerUser (ctx, next) {
    res=await personDB.find({username: ctx.request.body.username}).then((doc) => {
        if (doc.length>0) {
            return false
        }
        else{
            return true
        }})
    let passData = await Joi.validate(ctx.request.body, userRegSchema);
    passData.uid=uuid()
    passData.credit=100
    passData.number=0
    console.log(passData)
    if(res){
        ctx.body=await personDB.insert(passData).then((doc)=>{return true})
        await createWallet(passData.uid,false)
    }
    else{
        ctx.body=false
    }
    ctx.status = 201;
    //ctx.redirect('/')
    await next();
}


/**
 * @example curl -XPOST "http://localhost:8081/users/login" -d '{"username":"test","password":"123"}' -H 'Content-Type: application/json'
 */
async function loginUser (ctx, next) {
    return passport.authenticate('local', (err, user, info, status) => {
        if (user) {
            console.log('success')
            console.log(user)

            ctx.login(user)
            ctx.body={status:'success'}
            ctx.status=200
        } else {
            console.log('false at login')
            console.log(user)
            console.log(err)
            console.log(info)
            console.log(status)
            ctx.status = 400
            ctx.body={status:'error'}
        }
    })(ctx)
}


/**
 * @example curl -XGET "http://localhost:8081/users/logout"
 */
async function logoutUser (ctx, next) {
    ctx.logout()
    ctx.redirect('/')
    await next()
}


/**
 * @example curl -XPOST "http://localhost:8081/users/update" -d '{"name":"New record 3"}' -H 'Content-Type: application/json'
 */
async function updateUser (ctx, next) {
    // let body = await Joi.validate(ctx.request.body, userSchema, {allowUnknown: true});

    ctx.body = updateUserFunc(ctx.request.body)
    ctx.status=201
    await next();
}

async function getInfo(ctx,next){
    ctx.body=await queryPerson(ctx.params.id)
    ctx.status=201
    await next()
}



/**
 * @example curl -XGET "http://localhost:8081/users/delete/:id"
 */
async function removeUser (ctx, next) {
    await personDB.remove({uid:ctx.params.id});
    ctx.status = 204;
    await next();
}

async function updateUserFunc(user) {
    return await personDB.findOneAndUpdate(
        {uid:user.uid},
        {$set:user}).then((upd)=>{return true});
}

/**
 * @example
 * curl -XPOST "http://localhost:8081/users/rating" -d '{"uid":"...","rate":"80"}' -H 'Content-Type: application/json'
 */
 async function rateUser(ctx, next){
   ctx.body = await personDB.findOneAndUpdate(
       {uid:ctx.request.body.uid},
       {$set:{number:number+=1},{credit:(credit*(number-1)+rate)/number}}).then((docs)=>{return docs});
   ctx.status = 201
   await next()
 }

module.exports = {userRouter,updateUserFunc}
