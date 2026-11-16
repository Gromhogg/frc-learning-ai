export default {
  fetch(request, env) {
    return env.APP.fetch(request);
  },
};
