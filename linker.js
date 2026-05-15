/* LINK-ER — subtle interaction layer
 * Parallax tilt on device orientation / pointer move + button feedback.
 */
(() => {
  const stage = document.querySelector(".stage");
  if (!stage) return;

  const layers = {
    far:        document.querySelector(".city--far"),
    mid:        document.querySelector(".city--mid"),
    recognized: document.querySelector(".recognized"),
    capture:    document.querySelector(".capture"),
  };

  const max = { far: 6, mid: 10, recognized: 14, capture: 8 };

  let targetX = 0, targetY = 0;
  let curX = 0, curY = 0;

  function apply() {
    curX += (targetX - curX) * 0.06;
    curY += (targetY - curY) * 0.06;
    for (const k of Object.keys(layers)) {
      const el = layers[k];
      if (!el) continue;
      const dx = curX * max[k];
      const dy = curY * max[k] * 0.6;
      el.style.willChange = "transform";
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    }
    requestAnimationFrame(apply);
  }
  requestAnimationFrame(apply);

  // Pointer parallax (desktop / touch drag)
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    targetX = ((e.clientX - r.left) / r.width)  * 2 - 1;
    targetY = ((e.clientY - r.top)  / r.height) * 2 - 1;
  });

  stage.addEventListener("pointerleave", () => { targetX = 0; targetY = 0; });

  // Device orientation parallax (mobile)
  if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", (e) => {
      if (e.gamma == null || e.beta == null) return;
      targetX = Math.max(-1, Math.min(1, e.gamma / 30));
      targetY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    });
  }

  // Subtle button press feedback (haptic if available)
  document.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("pointerdown", () => {
      if (navigator.vibrate) navigator.vibrate(8);
    });
  });

  // Action button: pulse the route on tap
  const action = document.querySelector(".action__btn");
  const route  = document.querySelector(".route");
  if (action && route) {
    action.addEventListener("click", () => {
      route.animate(
        [
          { filter: "url(#lime-glow) brightness(1)"   },
          { filter: "url(#lime-glow) brightness(2.2)" },
          { filter: "url(#lime-glow) brightness(1)"   },
        ],
        { duration: 700, easing: "ease-out" }
      );
    });
  }
})();
