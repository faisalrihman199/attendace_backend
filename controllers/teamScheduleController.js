const TeamSchedule = require('../models/teamSchedule');
const AthleteGroup = require('../models/atheleteGroup');
const Business = require('../models/business');

// 🔐 Authorization helper
async function isAuthorized(groupId, user) {
  const group = await AthleteGroup.findByPk(groupId, {
    include: {
      model: Business,
      as: 'business', // Make sure this matches your association
      attributes: ['userId']
    }
  });

  if (!group || !group.business) return false;

  return group.business.userId === user.id || user.role === 'superAdmin';
}

// ➕ Create or Update schedule
exports.createOrUpdateSchedule = async (req, res) => {
  try {
    const { groupId, dayOfWeek, startTime, endTime } = req.body;

    if (!(await isAuthorized(groupId, req.user))) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [schedule, created] = await TeamSchedule.findOrCreate({
      where: { athleteGroupId: groupId, dayOfWeek },
      defaults: { startTime, endTime }
    });

    if (!created) {
      schedule.startTime = startTime;
      schedule.endTime = endTime;
      await schedule.save();
    }

    return res.status(200).json({ success: true, schedule });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// 📥 Get all schedules or by day
exports.getSchedules = async (req, res) => {
  try {
    const { groupId, dayOfWeek } = req.query;

    if (!groupId) return res.status(400).json({ error: 'groupId is required' });

    if (!(await isAuthorized(groupId, req.user))) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const where = { athleteGroupId: groupId };
    if (dayOfWeek) where.dayOfWeek = dayOfWeek;

    const schedules = await TeamSchedule.findAll({ where });

    const formattedSchedules = schedules.map(schedule => {
      // Format time fields using Date and toLocaleTimeString
      const formatTime = (timeStr) =>
        new Date(`1970-01-01T${timeStr}Z`).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZone: 'UTC',
        });

      return {
        ...schedule.toJSON(),
        startTime: formatTime(schedule.startTime),
        endTime: formatTime(schedule.endTime),
      };
    });

    return res.status(200).json({ success: true, schedules: formattedSchedules });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ❌ Delete schedule (by scheduleId OR groupId + dayOfWeek)
exports.deleteSchedule = async (req, res) => {
  try {
    const { scheduleId, groupId, dayOfWeek } = req.query;
    let schedule;

    if (scheduleId) {
      schedule = await TeamSchedule.findByPk(scheduleId);
      if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

      if (!(await isAuthorized(schedule.athleteGroupId, req.user))) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

    } else if (groupId && dayOfWeek) {
      if (!(await isAuthorized(groupId, req.user))) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      schedule = await TeamSchedule.findOne({
        where: { athleteGroupId: groupId, dayOfWeek }
      });

      if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    } else {
      return res.status(400).json({ error: 'Provide scheduleId or groupId + dayOfWeek' });
    }

    await schedule.destroy();
    return res.status(200).json({ success: true, message: 'Schedule deleted' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
