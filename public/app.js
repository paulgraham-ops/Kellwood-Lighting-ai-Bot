(function () {
  "use strict";

  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var chatMain = document.getElementById("chatMain");
  var intro = document.getElementById("intro");
  var chips = document.getElementById("chips");
  var form = document.getElementById("composerForm");
  var input = document.getElementById("input");
  var sendBtn = document.getElementById("sendBtn");
  var stopBtn = document.getElementById("stopBtn");
  var footNote = document.getElementById("footNote");

  var turns = [];
  var controller = null;
  var ready = false;

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }
  input.addEventListener("input", autoGrow);

  function scrollToEnd() {
    chatMain.scrollTop = chatMain.scrollHeight;
  }

  function renderInline(text) {
    var esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    esc = esc.replace(/`([^`]+)`/g, "<code>$1</code>");
    esc = esc.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return esc;
  }

  function renderMarkdownLite(text) {
    var lines = text.split("\n");
    var html = "";
    var inList = false;
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + renderInline(trimmed.replace(/^[-*]\s+/, "")) + "</li>";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        if (trimmed === "") continue;
        html += "<p>" + renderInline(trimmed) + "</p>";
      }
    }
    if (inList) html += "</ul>";
    return html || "<p></p>";
  }

  function addMessage(role, text) {
    var msg = document.createElement("div");
    msg.className = "msg " + role;
    var avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "YOU" : "KW";
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = renderMarkdownLite(text);
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    chatMain.appendChild(msg);
    scrollToEnd();
    return bubble;
  }

  function addThinkingBubble() {
    var msg = document.createElement("div");
    msg.className = "msg bot";
    var avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "KW";
    var bubble = document.createElement("div");
    bubble.className = "bubble thinking";
    bubble.textContent = "Thinking…";
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    chatMain.appendChild(msg);
    scrollToEnd();
    return bubble;
  }

  function setBusy(isBusy) {
    sendBtn.hidden = isBusy;
    stopBtn.hidden = !isBusy;
    input.disabled = isBusy || !ready;
  }

  async function ask(question) {
    if (!ready) return;
    intro.hidden = true;
    addMessage("user", question);
    turns.push({ role: "user", content: question });
    setBusy(true);

    var bubble = addThinkingBubble();
    var fullText = "";
    var started = false;
    controller = new AbortController();

    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: turns }),
        signal: controller.signal,
      });

      if (!res.ok) {
        var errBody = await res.json().catch(function () { return {}; });
        throw new Error(errBody.error || ("Request failed (" + res.status + ")"));
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var events = buffer.split("\n\n");
        buffer = events.pop();

        for (var i = 0; i < events.length; i++) {
          var block = events[i];
          var eventMatch = block.match(/^event: (.+)$/m);
          var dataMatch = block.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;
          var eventName = eventMatch[1];
          var data = JSON.parse(dataMatch[1]);

          if (eventName === "delta") {
            started = true;
            fullText += data.delta;
            bubble.className = "bubble";
            bubble.innerHTML = renderMarkdownLite(fullText);
            scrollToEnd();
          } else if (eventName === "error") {
            throw new Error(data.message || "Something went wrong.");
          } else if (eventName === "done") {
            if (data.truncated) {
              var note = document.createElement("span");
              note.className = "cut-note";
              note.textContent = "Cut short — ask a narrower question for the full answer.";
              bubble.appendChild(note);
            }
          }
        }
      }

      if (!started) {
        bubble.className = "bubble error";
        bubble.textContent = "No answer came back — try rephrasing.";
        turns.pop();
      } else {
        turns.push({ role: "assistant", content: fullText });
      }
    } catch (err) {
      if (err.name === "AbortError") {
        if (!started) turns.pop();
        bubble.className = fullText ? "bubble" : "bubble error";
        if (!fullText) bubble.textContent = "Stopped.";
      } else {
        bubble.className = "bubble error";
        bubble.textContent = err.message || "Something went wrong.";
        turns.pop();
      }
    } finally {
      setBusy(false);
      controller = null;
      scrollToEnd();
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || input.disabled) return;
    input.value = "";
    autoGrow();
    ask(text);
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  stopBtn.addEventListener("click", function () {
    if (controller) controller.abort();
  });

  chips.addEventListener("click", function (e) {
    var btn = e.target.closest(".chip");
    if (!btn) return;
    ask(btn.textContent);
  });

  function goOffline(message) {
    statusDot.classList.add("off");
    statusText.textContent = "unavailable";
    input.placeholder = "The assistant isn't available right now";
    footNote.textContent = message;
  }

  (async function init() {
    try {
      var res = await fetch("/api/health");
      var data = await res.json();
      if (!data.ok || !data.anthropic) {
        goOffline(
          data.ok && !data.anthropic
            ? "Server is missing its Claude API key — ask the maintainer to set ANTHROPIC_API_KEY."
            : "Server isn't responding correctly.",
        );
        return;
      }
    } catch (err) {
      goOffline("Can't reach the server.");
      return;
    }
    ready = true;
    statusText.textContent = "ready";
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  })();
})();
