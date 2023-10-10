/*global UIkit, Vue */
const wsProto = location.protocol === "https" ? "wss:" : "ws:";
const loginContainer = document.getElementById("login");

(() => {
  const notification = (config) =>
    UIkit.notification({
      pos: "top-right",
      timeout: 5000,
      ...config,
    });

  const alert = (message) =>
    notification({
      message,
      status: "danger",
    });

  const info = (message) =>
    notification({
      message,
      status: "success",
    });

  const fetchJson = (...args) =>
    fetch(...args)
      .then((res) =>
        res.ok
          ? res.status !== 204
            ? res.json()
            : null
          : res.text().then((text) => {
              throw new Error(text);
            })
      )
      .catch((err) => {
        alert(err.message);
      });

  new Vue({
    el: "#app",
    data: {
      desc: "",
      activeTimers: [],
      oldTimers: [],
      client: null
    },
    methods: {
      sendMessage(message) {
        if (this.client.readyState === WebSocket.OPEN) {
          this.client.send(message);
        } else {
          console.log("WebSocket закрыт, состояние", this.client.readyState);
        }
      },
      checkMessage(type, data) {
        if (!this.client) {
          this.client = new WebSocket(`${wsProto}//${location.host}`);

          this.client.addEventListener("open", () => {
            this.sendMessage(JSON.stringify({ type, ...data }));
          });
        } else {
          this.sendMessage(JSON.stringify({ type, ...data }));
        }
      },
      postAllTimers() {
        fetchJson("/api/timers", {
          method: "get",
          headers: {
            "Content-Type": "application/json",
          },
        }).then((timers) => {
          const activeTimers = timers.filter((timer) => timer.end === null);
          const oldTimers = timers.filter((timer) => timer.end !== null);
          this.activeTimers = activeTimers;
          this.oldTimers = oldTimers;
          this.checkMessage("all_timers", { activeTimers, oldTimers });
        });
      },
      postActiveTimers() {
        fetchJson("/api/timers", {
          method: "get",
          headers: {
            "Content-Type": "application/json",
          },
        }).then((timers) => {
          const activeTimers = timers.filter((timer) => timer.end === null);
          this.activeTimers = activeTimers;
          this.checkMessage("active_timers", { activeTimers });
        });
      },
      createTimer() {
        const description = this.desc;
        this.desc = "";
        fetchJson("/api/timers", {
          method: "post",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ description }),
        }).then(({ id }) => {
          info(`Created new timer "${description}" [${id}]`);
          this.postAllTimers();
        });
      },
      stopTimer(id) {
        fetchJson(`/api/timers/${id}/stop`, {
          method: "post",
        }).then(() => {
          info(`Stopped the timer [${id}]`);
          this.postAllTimers();
        });
      },
      formatTime(ts) {
        return new Date(ts).toTimeString().split(" ")[0];
      },
      formatDuration(d) {
        d = Math.floor(d / 1000);
        const s = d % 60;
        d = Math.floor(d / 60);
        const m = d % 60;
        const h = Math.floor(d / 60);
        return [h > 0 ? h : null, m, s]
          .filter((x) => x !== null)
          .map((x) => (x < 10 ? "0" : "") + x)
          .join(":");
      },
    },
    created() {
      loginContainer.addEventListener("submit", (event) => {
        event.preventDefault();
        const username = loginContainer.querySelector(".username").value;
        const password = loginContainer.querySelector(".password").value;

        fetch("/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
          headers: {
            "Content-Type": "application/json",
          },
        }).then((response) => {
          if (response.ok) {
            return response.json();
          } else {
            return response.text().then((err) => {
              throw new Error(err);
            })
          }
        }).then(({ token }) => {
          this.client = new WebSocket(`${wsProto}//${location.host}?token=${token}`);
          loginContainer.style.display = "none";
          this.client.addEventListener('open', () => {
            this.postAllTimers();
            setInterval(() => {
              this.postActiveTimers();
            }, 1000);
          });
        }).catch(err => {
          console.log(err.message);
        })
      })
    },

  });



})();
