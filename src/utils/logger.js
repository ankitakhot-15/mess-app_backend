const stamp = () => new Date().toISOString();
module.exports = {
  info: (...a) => console.log(stamp(), '[INFO]', ...a),
  warn: (...a) => console.warn(stamp(), '[WARN]', ...a),
  error: (...a) => console.error(stamp(), '[ERROR]', ...a),
};
