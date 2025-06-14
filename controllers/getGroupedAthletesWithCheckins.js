const { Op } = require('sequelize');
const model = require('../models'); // adjust path to your project
const moment = require('moment-timezone');

function getStartDateForPeriod(period, timezone) {
  const now = moment().tz(timezone);
  switch (period) {
    case 'year':
      return now.clone().startOf('year').toDate();
    case 'monthly':
      return now.clone().startOf('month').toDate();
    case 'weekly':
      return now.clone().subtract(6, 'days').startOf('day').toDate();
    case 'daily':
    default:
      return now.clone().startOf('day').toDate();
  }
}

async function getGroupedAthletesWithCheckins({ businessId, groupType = 'team', period = 'daily', groupId = null }) {
  const business = await model.business.findOne({
    where: { id: businessId },
    attributes: ['id', 'name', 'timezone']
  });

  if (!business) throw new Error('Business not found');

  const timezone = business.timezone || 'UTC';
  const startDate = getStartDateForPeriod(period, timezone);
  const endDate = moment().tz(timezone).endOf('day').toDate();

  let groups;
  if (groupId) {
    groups = await model.AthleteGroup.findAll({
      where: { id: groupId, businessId },
      include: [{ model: model.Athlete, attributes: ['id', 'name'] }]
    });
  } else {
    groups = await model.AthleteGroup.findAll({
      where: { businessId, category: groupType },
      order: [['createdAt', 'ASC']],
      limit: 1,
      include: [{ model: model.Athlete, attributes: ['id', 'name'] }]
    });
  }

  if (!groups.length) return [];

  const result = [];

  for (const group of groups) {
    const athleteIds = group.Athletes.map((a) => a.id);

    const allCheckins = await model.checkin.findAll({
      where: {
        athleteId: { [Op.in]: athleteIds },
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: ['id', 'athleteId', 'createdAt'],
      order: [['createdAt', 'ASC']]
    });

    const checkinMap = {};
    for (const checkin of allCheckins) {
      const aid = checkin.athleteId;
      if (!checkinMap[aid]) checkinMap[aid] = [];
      checkinMap[aid].push({
        id: checkin.id,
        createdAt: checkin.createdAt
      });
    }

    const schedules = await model.teamSchedule.findAll({
      where: { athleteGroupId: group.id },
      attributes: ['dayOfWeek', 'startTime']
    });

    const scheduleMap = {};
    schedules.forEach((s) => {
      scheduleMap[s.dayOfWeek] = s.startTime?.slice(0, 5); // HH:mm
    });

    let dateList = [];

    if (period === 'daily') {
      dateList = [moment().tz(timezone).startOf('day')];
    } else {
      let loop = moment(startDate).tz(timezone).startOf('day');
      const end = moment(endDate).tz(timezone).endOf('day');
      while (loop.isSameOrBefore(end, 'day')) {
        dateList.push(loop.clone());
        loop.add(1, 'day');
      }
    }

    let totalLate = 0;
    let totalOnTime = 0;
    let totalMissing = 0;

    const processedAthletes = group.Athletes.map((a) => {
      const athleteCheckins = checkinMap[a.id] || [];
      const attendance = [];

      for (const dateObj of dateList) {
        const day = dateObj.format('dddd');
        const dateStr = dateObj.format('YYYY-MM-DD');
        const scheduledTime = scheduleMap[day];

        const checkin = athleteCheckins.find(ci =>
          moment(ci.createdAt).tz(timezone).format('YYYY-MM-DD') === dateStr
        );

        if (!checkin) {
          attendance.push({
            date: dateStr,
            day,
            status: 'missing',
            ...(scheduledTime && { scheduledTime: moment(scheduledTime, 'HH:mm').format('hh:mm A') })
          });
          totalMissing++;
          continue;
        }

        const checkTime = moment(checkin.createdAt).tz(timezone).format('HH:mm');

        let status;
        if (scheduledTime) {
          status = checkTime <= scheduledTime ? 'on time' : 'late';
        } else {
          status = 'on time';
        }

        attendance.push({
          date: dateStr,
          day,
          status,
          checkInTime: moment(checkin.createdAt).tz(timezone).format('hh:mm A'),
          ...(scheduledTime && { scheduledTime: moment(scheduledTime, 'HH:mm').format('hh:mm A') })
        });

        if (status === 'on time') totalOnTime++;
        if (status === 'late') totalLate++;
      }

      return {
        id: a.id,
        name: a.name,
        attendance
      };
    });

    const totalCheckins = allCheckins.length;
    const totalAthletes = group.Athletes.length;
    const totalDays = dateList.length;
    const percentage = totalDays > 0 ? Math.round(((totalOnTime + totalLate) / (totalAthletes * totalDays)) * 100) : 0;

    result.push({
      groupId: group.id,
      groupName: group.groupName,
      category: group.category,
      timezone,
      totalAthletes,
      totalCheckins,
      totalDays,
      totalLate,
      totalOnTime,
      totalMissing,
      percentage,
      athletes: processedAthletes
    });
  }

  return result;
}

module.exports = { getGroupedAthletesWithCheckins };
