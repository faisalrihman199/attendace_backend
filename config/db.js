var {Sequelize}  = require("sequelize")

const sequelize = new Sequelize({
    host:'localhost',
    username: 'root' ,
    // password : '',
    database: 'attendence_system',
    dialect: 'mysql',
    logging: false, 
    pool: {
        max: 150,
        min: 0,
        acquire: 30000000, 
        idle: 10000
      }
});


// async () => {
//    sequelize.sync();
// }

(async () => {
   try {
       await sequelize.sync();
       console.log('Database synchronized successfully');
   } catch (error) {
       console.error('Error synchronizing database:', error);
   }
})();



module.exports = sequelize;
