/*
 * Mimie's Care and Clean - cart and WhatsApp ordering
 * Customers add products to the cart, then "Send order" opens WhatsApp
 * with the full order typed out, ready to send.
 *
 * To change the WhatsApp or MoMo details, edit SHOP below.
 */
(function () {
    "use strict";

    var SHOP = {
        name: "Mimie's Care and Clean",
        whatsapp: "233548125836",          // 0548125836 in international format (233 + number without the first 0)
        momoNumber: "0598627275",
        momoName: "Dufie Patience",
        currency: "GH₵"
    };

    var STORAGE_KEY = "mimie_cart_v1";
    var cart = loadCart();      // [{key, id, name, option, price, qty}]

    /* ---------- helpers ---------- */

    function money(n) {
        return SHOP.currency + " " + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function clampQty(n) {
        n = parseInt(n, 10);
        if (isNaN(n) || n < 1) return 1;
        return Math.min(99, n);
    }

    function loadCart() {
        try {
            var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

    function saveCart() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (e) { /* storage blocked: cart still works for this visit */ }
    }

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }

    function totals() {
        var count = 0, sum = 0;
        cart.forEach(function (item) { count += item.qty; sum += item.qty * item.price; });
        return { count: count, sum: sum };
    }

    /* ---------- cart UI (built once) ---------- */

    var ui = {};

    function buildUI() {
        // Floating cart button
        ui.fab = el("button", "cart-fab");
        ui.fab.type = "button";
        ui.fab.setAttribute("aria-label", "Open cart");
        ui.fab.innerHTML = '<span class="cart-fab-icon" aria-hidden="true">🛒</span><span class="cart-fab-label">Cart</span>';
        ui.badge = el("span", "cart-badge", "0");
        ui.fab.appendChild(ui.badge);

        // Toast
        ui.toast = el("div", "cart-toast");
        ui.toast.setAttribute("role", "status");
        ui.toast.setAttribute("aria-live", "polite");

        // Drawer
        ui.overlay = el("div", "cart-overlay");
        ui.drawer = el("aside", "cart-drawer");
        ui.drawer.setAttribute("aria-label", "Your cart");
        ui.drawer.innerHTML =
            '<div class="cart-head">' +
                '<h2>Your Cart</h2>' +
                '<button type="button" class="cart-close" aria-label="Close cart">✕</button>' +
            '</div>' +
            '<div class="cart-body">' +
                '<ul class="cart-items"></ul>' +
                '<p class="cart-empty">Your cart is empty. Tap a product, then "Add to Cart".</p>' +
                '<div class="cart-checkout">' +
                    '<div class="cart-total"><span>Total</span><strong class="cart-total-value"></strong></div>' +
                    '<p class="cart-section">Delivery details</p>' +
                    '<label class="cart-field">Your name' +
                        '<input type="text" class="cart-name" autocomplete="name" placeholder="e.g. Ama Mensah" />' +
                    '</label>' +
                    '<label class="cart-field">Phone number for calls' +
                        '<span class="cart-hint">The rider will call this number. It can be different from your WhatsApp.</span>' +
                        '<input type="tel" class="cart-phone" autocomplete="tel" inputmode="tel" maxlength="16" placeholder="e.g. 0241234567" />' +
                    '</label>' +
                    '<label class="cart-field">Location / area' +
                        '<input type="text" class="cart-location" placeholder="e.g. Kato, Senase, Berekum SHS" />' +
                    '</label>' +
                    '<label class="cart-field">Landmark or directions (optional)' +
                        '<input type="text" class="cart-landmark" placeholder="e.g. Near the Methodist church" />' +
                    '</label>' +
                    '<label class="cart-field">When and how should we deliver? (optional)' +
                        '<textarea class="cart-note" rows="2" placeholder="e.g. After 4pm, call me when you reach the gate"></textarea>' +
                    '</label>' +
                    '<div class="cart-pay">' +
                        '<strong>How to pay</strong>' +
                        '<p>Send your order on WhatsApp first. Once we confirm it, pay the total by MoMo to:</p>' +
                        '<p class="cart-momo"><span class="momo-number"></span><br /><span class="momo-name"></span></p>' +
                    '</div>' +
                    '<p class="cart-error" role="alert"></p>' +
                    '<button type="button" class="cart-send"><span aria-hidden="true">💬</span> Send order on WhatsApp</button>' +
                    '<button type="button" class="cart-clear">Clear cart</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(ui.fab);
        document.body.appendChild(ui.toast);
        document.body.appendChild(ui.overlay);
        document.body.appendChild(ui.drawer);

        ui.items = ui.drawer.querySelector(".cart-items");
        ui.empty = ui.drawer.querySelector(".cart-empty");
        ui.checkout = ui.drawer.querySelector(".cart-checkout");
        ui.total = ui.drawer.querySelector(".cart-total-value");
        ui.name = ui.drawer.querySelector(".cart-name");
        ui.note = ui.drawer.querySelector(".cart-note");
        ui.phone = ui.drawer.querySelector(".cart-phone");
        ui.location = ui.drawer.querySelector(".cart-location");
        ui.landmark = ui.drawer.querySelector(".cart-landmark");
        ui.error = ui.drawer.querySelector(".cart-error");
        ui.drawer.querySelector(".momo-number").textContent = "MoMo: " + SHOP.momoNumber;
        ui.drawer.querySelector(".momo-name").textContent = "Name: " + SHOP.momoName;

        // Fill in details from the customer's last order on this phone.
        try {
            var saved = JSON.parse(localStorage.getItem(STORAGE_KEY + "_customer") || "{}");
            ui.name.value = saved.name || localStorage.getItem(STORAGE_KEY + "_name") || "";
            ui.phone.value = saved.phone || "";
            ui.location.value = saved.location || "";
            ui.landmark.value = saved.landmark || "";
        } catch (e) {}

        ui.fab.addEventListener("click", openCart);
        ui.overlay.addEventListener("click", closeCart);
        ui.drawer.querySelector(".cart-close").addEventListener("click", closeCart);
        ui.drawer.querySelector(".cart-send").addEventListener("click", sendOrder);
        ui.drawer.querySelector(".cart-clear").addEventListener("click", function () {
            if (!cart.length) return;
            cart = [];
            saveCart();
            render();
        });
        ui.items.addEventListener("click", onItemClick);
        ui.items.addEventListener("change", onItemChange);
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && document.body.classList.contains("cart-open")) closeCart();
        });
    }

    function render() {
        var t = totals();
        ui.badge.textContent = t.count;
        ui.badge.style.display = t.count ? "" : "none";
        ui.fab.classList.toggle("has-items", t.count > 0);

        ui.items.innerHTML = "";
        cart.forEach(function (item, index) {
            var li = el("li", "cart-item");
            li.dataset.index = index;

            var info = el("div", "cart-item-info");
            info.appendChild(el("span", "cart-item-name", item.name + (item.option ? " (" + item.option + ")" : "")));
            info.appendChild(el("span", "cart-item-price", money(item.price) + " each"));

            var controls = el("div", "cart-item-controls");
            var minus = el("button", "ci-step", "−"); minus.type = "button"; minus.dataset.step = "-1"; minus.setAttribute("aria-label", "Less");
            var qty = el("input", "ci-qty"); qty.type = "number"; qty.min = 1; qty.max = 99; qty.value = item.qty; qty.setAttribute("inputmode", "numeric"); qty.setAttribute("aria-label", "Quantity");
            var plus = el("button", "ci-step", "+"); plus.type = "button"; plus.dataset.step = "1"; plus.setAttribute("aria-label", "More");
            var line = el("span", "cart-item-line", money(item.price * item.qty));
            var remove = el("button", "ci-remove", "Remove"); remove.type = "button";
            controls.appendChild(minus); controls.appendChild(qty); controls.appendChild(plus);
            controls.appendChild(line); controls.appendChild(remove);

            li.appendChild(info);
            li.appendChild(controls);
            ui.items.appendChild(li);
        });

        ui.empty.style.display = cart.length ? "none" : "";
        ui.checkout.style.display = cart.length ? "" : "none";
        ui.total.textContent = money(t.sum);
        ui.error.textContent = "";
    }

    function onItemClick(e) {
        var li = e.target.closest(".cart-item");
        if (!li) return;
        var item = cart[+li.dataset.index];
        if (!item) return;
        if (e.target.classList.contains("ci-remove")) {
            cart.splice(+li.dataset.index, 1);
        } else if (e.target.classList.contains("ci-step")) {
            var next = item.qty + parseInt(e.target.dataset.step, 10);
            if (next < 1) cart.splice(+li.dataset.index, 1);
            else item.qty = clampQty(next);
        } else {
            return;
        }
        saveCart();
        render();
    }

    function onItemChange(e) {
        if (!e.target.classList.contains("ci-qty")) return;
        var li = e.target.closest(".cart-item");
        var item = cart[+li.dataset.index];
        if (!item) return;
        item.qty = clampQty(e.target.value);
        saveCart();
        render();
    }

    function openCart() {
        render();
        document.body.classList.add("cart-open");
        setTimeout(function () { ui.drawer.querySelector(".cart-close").focus(); }, 50);
    }

    function closeCart() {
        document.body.classList.remove("cart-open");
        ui.fab.focus();
    }

    var toastTimer;
    function showToast(message) {
        ui.toast.textContent = message;
        ui.toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { ui.toast.classList.remove("show"); }, 2200);
    }

    /* ---------- product controls (inside each product) ---------- */

    function readOptions(controls) {
        try { return JSON.parse(controls.getAttribute("data-options")) || []; } catch (e) { return []; }
    }

    function addFromControls(controls) {
        var options = readOptions(controls);
        if (!options.length) return;
        var select = controls.querySelector(".variant");
        var opt = options[select ? +select.value : 0] || options[0];
        var input = controls.querySelector(".qty");
        var qty = clampQty(input && input.value);
        var name = controls.getAttribute("data-name");
        var key = controls.getAttribute("data-id") + "|" + (opt.l || "");

        var existing = null;
        cart.forEach(function (item) { if (item.key === key) existing = item; });
        if (existing) existing.qty = clampQty(existing.qty + qty);
        else cart.push({ key: key, id: controls.getAttribute("data-id"), name: name, option: opt.l || "", price: opt.p, qty: qty });

        saveCart();
        render();
        if (input) input.value = 1;
        showToast("Added " + qty + " × " + name + (opt.l ? " (" + opt.l + ")" : "") + " to your cart");

        var btn = controls.querySelector(".add-to-cart");
        if (btn) {
            btn.classList.add("added");
            btn.textContent = "✓ Added";
            setTimeout(function () { btn.classList.remove("added"); btn.textContent = "🛒 Add to Cart"; }, 1200);
        }
    }

    // One listener for all products. Works even after the gallery moves
    // the product details into the big image viewer.
    document.addEventListener("click", function (e) {
        var controls = e.target.closest(".purchase-controls");
        if (!controls) return;
        if (e.target.closest(".qty-btn")) {
            var input = controls.querySelector(".qty");
            input.value = clampQty(clampQty(input.value) + parseInt(e.target.closest(".qty-btn").dataset.step, 10));
        } else if (e.target.closest(".add-to-cart")) {
            addFromControls(controls);
        }
    });

    document.addEventListener("change", function (e) {
        if (e.target.classList && e.target.classList.contains("qty") && e.target.closest(".purchase-controls")) {
            e.target.value = clampQty(e.target.value);
        }
    });

    /* ---------- send order on WhatsApp ---------- */

    function buildMessage() {
        var lines = [];
        var t = totals();
        lines.push("Hello " + SHOP.name + " 👋");
        lines.push("I would like to order:");
        lines.push("");
        cart.forEach(function (item, i) {
            lines.push((i + 1) + ". " + item.name + (item.option ? " (" + item.option + ")" : "") +
                " × " + item.qty + " = " + money(item.price * item.qty));
        });
        lines.push("");
        lines.push("*Total: " + money(t.sum) + "*");
        lines.push("");
        lines.push("*Delivery details*");
        lines.push("Name: " + ui.name.value.trim());
        lines.push("Phone (calls): " + ui.phone.value.trim());
        lines.push("Location: " + ui.location.value.trim());
        var landmark = ui.landmark.value.trim();
        if (landmark) lines.push("Landmark: " + landmark);
        var note = ui.note.value.trim();
        if (note) lines.push("Delivery instructions: " + note);
        lines.push("");
        lines.push("I will pay by MoMo to " + SHOP.momoNumber + " (" + SHOP.momoName + ") after you confirm my order.");
        return lines.join("\n");
    }

    // Ghana numbers: 10 digits starting with 0 (0241234567), or with +233 / 233 in front.
    function validPhone(value) {
        var digits = String(value).replace(/[\s\-()]/g, "");
        return /^0\d{9}$/.test(digits) || /^\+?233\d{9}$/.test(digits);
    }

    function sendOrder() {
        if (!cart.length) return;
        function fail(message, field) {
            ui.error.textContent = message;
            field.focus();
        }
        if (!ui.name.value.trim()) return fail("Please enter your name.", ui.name);
        if (!validPhone(ui.phone.value)) return fail("Please enter a phone number the rider can call, e.g. 0241234567.", ui.phone);
        if (!ui.location.value.trim()) return fail("Please enter your location or area.", ui.location);
        ui.error.textContent = "";
        try {
            localStorage.setItem(STORAGE_KEY + "_customer", JSON.stringify({
                name: ui.name.value.trim(), phone: ui.phone.value.trim(),
                location: ui.location.value.trim(), landmark: ui.landmark.value.trim()
            }));
        } catch (e) {}

        var url = "https://wa.me/" + SHOP.whatsapp + "?text=" + encodeURIComponent(buildMessage());
        // Open WhatsApp with a normal link so phones hand it to the WhatsApp app.
        var link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    /* ---------- product search (works with the gallery) ---------- */

    function initSearch() {
        var box = document.getElementById("productSearch");
        var gallery = document.getElementById("thumbnails");
        if (!box || !gallery) return;

        var message = el("p", "search-empty", "Sorry, no products found.");
        message.style.display = "none";
        gallery.parentNode.insertBefore(message, gallery);

        box.addEventListener("input", function () {
            var q = box.value.toLowerCase().trim();
            var found = 0;
            gallery.querySelectorAll("article").forEach(function (article) {
                var text = article.getAttribute("data-search") || "";
                var show = !q || (text && text.indexOf(q) !== -1);
                article.style.display = show ? "" : "none";
                if (show && text) found++;
            });
            message.style.display = q && !found ? "" : "none";
        });
    }

    /* ---------- start ---------- */

    function init() {
        buildUI();
        render();
        initSearch();

        // On phones the gallery closes the product list (or swipes to the next
        // photo) when the big image is touched. Stop touches on the buttons from
        // doing that. Taps still work as normal clicks.
        ["touchstart", "touchmove", "touchend"].forEach(function (type) {
            document.addEventListener(type, function (e) {
                if (e.target.closest && e.target.closest("#viewer .purchase-controls")) e.stopPropagation();
            }, { capture: true, passive: true });
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
