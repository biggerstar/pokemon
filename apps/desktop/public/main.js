import {aB as e, aC as t, aD as n, aE as a, aF as o, aG as s, u as i, f as r, aH as l, b as d, a as c, I as u, Z as m, a8 as p, K as g, N as h, x as f, g as L, i as v, o as _, q as y, e as w, z as E, h as b, F as S, a0 as U, s as A, Y as C, D as k, ag as I, aI as T, aJ as D, aK as N, aL as P, aM as H, aN as O, aO as x, aP as M, aQ as j, aR as G, aS as W, aT as B, aU as R, aV as z, aW as V, aX as K, aY as Y, aZ as $, a_ as X, a$ as F, b0 as J, b1 as Z, b2 as q} from "../js/vendor-GH5N_v0.0.0.0.2025112610593434.release.js";
import {L as Q, A as ee, B as te, a as ne, b as ae, P as oe, R as se, c as ie, C as re, G as le, _ as de, d as ce, M as ue, e as me, S as pe, f as ge, g as he, h as fe, N as Le, i as ve, j as _e, k as ye, s as we, l as Ee, m as be, n as Se, u as Ue, o as Ae, r as Ce} from "../js/assets-GH5N_v0.0.0.0.2025112610593434.release.js";
import "../js/assets-lang-ar-GH5N_v0.0.0.0.2025112610593434.release.js";
import "../js/assets-lang-cn-GH5N_v0.0.0.0.2025112610593434.release.js";
import "../js/assets-lang-en-GH5N_v0.0.0.0.2025112610593434.release.js";
import "../js/assets-lang-GH5N_v0.0.0.0.2025112610593434.release.js";
import "../js/assets-lang-kr-GH5N_v0.0.0.0.2025112610593434.release.js";
import "../js/assets-lang-tc-GH5N_v0.0.0.0.2025112610593434.release.js";
import "../js/assets-lang-th-GH5N_v0.0.0.0.2025112610593434.release.js";
import "../js/assets-lang-vi-GH5N_v0.0.0.0.2025112610593434.release.js";
!function() {
    const e = document.createElement("link").relList;
    if (!(e && e.supports && e.supports("modulepreload"))) {
        for (const e of document.querySelectorAll('link[rel="modulepreload"]'))
            t(e);
        new MutationObserver(e => {
            for (const n of e)
                if ("childList" === n.type)
                    for (const e of n.addedNodes)
                        "LINK" === e.tagName && "modulepreload" === e.rel && t(e)
        }
        ).observe(document, {
            childList: !0,
            subtree: !0
        })
    }
    function t(e) {
        if (e.ep)
            return;
        e.ep = !0;
        const t = function(e) {
            const t = {};
            return e.integrity && (t.integrity = e.integrity),
            e.referrerPolicy && (t.referrerPolicy = e.referrerPolicy),
            "use-credentials" === e.crossOrigin ? t.credentials = "include" : "anonymous" === e.crossOrigin ? t.credentials = "omit" : t.credentials = "same-origin",
            t
        }(e);
        fetch(e.href, t)
    }
}();
const ke = be(d({
    __name: "App",
    setup(d) {
        const {locale: T} = i()
          , {elementLocale: D} = ( () => {
            e.el.pagination = {
                ...e.el.pagination,
                goto: "跳转到",
                pageClassifier: ""
            },
            t.el.pagination = {
                ...t.el.pagination,
                goto: "Jump to",
                pageClassifier: ""
            },
            n.el.pagination = {
                ...n.el.pagination,
                goto: "넘어가기",
                pageClassifier: ""
            },
            a.el.pagination = {
                ...a.el.pagination,
                goto: "跳轉到",
                pageClassifier: ""
            },
            o.el.pagination = {
                ...o.el.pagination,
                goto: "ย้ายไปที่",
                pageClassifier: ""
            },
            s.el.pagination = {
                ...s.el.pagination,
                goto: "Chuyển tới",
                pageClassifier: ""
            },
            l.el.pagination = {
                ...t.el.pagination,
                goto: "القفز إلى",
                pageClassifier: ""
            };
            const {locale: d} = i();
            return {
                elementLocale: r( () => {
                    switch (d.value) {
                    case Q.CN:
                        return e;
                    case Q.EN:
                        return t;
                    case Q.KR:
                        return n;
                    case Q.TC:
                        return a;
                    case Q.TH:
                        return o;
                    case Q.VI:
                        return s;
                    case Q.AR:
                        return l
                    }
                    return e
                }
                )
            }
        }
        )();
        ["preload-img-v_xuni_bg_hong1", "preload-img-v_xuni_bg_lv2", "preload-img-v_xuni_bg_lan2", "hanyuan_bet"].forEach(e => {
            const t = document.createElement("div");
            t.style.position = "fixed",
            t.style.top = "-9999px",
            t.style.left = "-9999px",
            t.className = e,
            document.body.appendChild(t)
        }
        );
        let N, P = null;
        const H = c(!0)
          , O = c({})
          , x = c(!1)
          , M = ee.LocationPropertyUtils.getPara("params")
          , j = c(0)
          , G = c(0)
          , W = c(0)
          , B = c(0)
          , R = c(1)
          , z = c(0);
        I(Ee, {
            windowWidth: j,
            windowHeight: G,
            innerWidth: W,
            innerHeight: B,
            targetWidth: z,
            screenRate: R
        }),
        u( () => T.value, () => {
            document.documentElement.lang = T.value,
            we()
        }
        , {
            immediate: !0
        });
        const V = () => {
            H.value = !1,
            localStorage.setItem("local-version-loading", window.VERSION)
        }
          , K = async () => {
            if ((new me).switchLoginData(),
            x.value) {
                le.ISCLEARCACHE = !0,
                ne.setCache("3_1", "2", !1),
                ne.setCache("31_2", "2", !1);
                const e = (new Date).getHours();
                e > 6 && e < 22 ? pe.WHITE : pe.BLACK,
                te.instance().setCache("9_1", "4", !1),
                ee.LocalStoreUtils.setDemoAccountId(oe.playerId)
            }
            ge(le.languageAllType[ne.LANGUAGE]).then( () => {
                le.initlanguage()
            }
            ),
            le.initSkin(),
            he.init(),
            te.instance().initSetting(),
            ee.PresenterManager.openPresenter(fe.Loading, {
                isNotCreateView: !0
            });
            const e = ee.PresenterManager.getPresenterByName(fe.Loading.name);
            e && e.model.switchLoginData()
        }
          , Y = () => {
            const e = .01 * window.innerHeight;
            document.documentElement.style.setProperty("--vh", `${e}px`);
            let t = window.innerWidth;
            const n = document.getElementById("app");
            window.innerWidth / window.innerHeight > 1.7777777777777777 ? (n.style.width = 1.7777777777777777 * window.innerHeight + "px",
            n.style.height = "100%",
            n.style.top = "0",
            n.style.left = (window.innerWidth - 1.7777777777777777 * window.innerHeight) / 2 + "px",
            t = 1.7777777777777777 * window.innerHeight) : window.innerWidth / window.innerHeight < 1.7777777777777777 ? (n.style.width = "100%",
            n.style.height = window.innerWidth / 1.7777777777777777 + "px",
            n.style.top = (window.innerHeight - window.innerWidth / 1.7777777777777777) / 2 + "px",
            n.style.left = "0") : (n.style.width = "100%",
            n.style.height = "100%",
            n.style.top = "0",
            n.style.left = "0"),
            j.value = window.innerWidth,
            G.value = window.innerHeight,
            R.value = 1920 / t,
            W.value = n.clientWidth,
            B.value = n.clientHeight,
            z.value = t,
            document.documentElement.style.setProperty("--app-width", n.style.width),
            document.documentElement.style.fontSize = t / 10 + "px",
            window.targetWidth = t,
            console.log("onScreenResize"),
            ee.NoticeCenter.sendNotify(Le.WINDOW_RESIZE)
        }
        ;
        Y();
        const $ = m(Y, 200);
        p( () => {
            ( () => {
                if (ee.AnalysisUrlUtils.checkUrlParams()) {
                    const e = ee.AnalysisUrlUtils.getLoginData();
                    if (oe.playerId = e.playerId,
                    oe.jwtToken = e.jwtToken,
                    e.params.backendDomainUrl) {
                        const t = e.params.backendDomainUrl.trim();
                        le.socketServer = `wss://wsproxy.${t}`,
                        le.httpServer = `https://gateway.${t}/game-http/`
                    }
                    if (e.params.h5DomainUrlList) {
                        const t = ee.CommonUtils.getH5DomainUrlList(e.params.h5DomainUrlList)
                          , n = ee.CommonUtils.getDomainUrlList(e.params.domainUrlList);
                        le.dealerShow = "https://hgfc." + t + "/#/",
                        le.gameHelpUrl = "https://xsjj." + t + "/ui4/#/gameHelp",
                        le._gameBranchHallUrl = "https://activity." + t + "/#/branch-hall",
                        le.h5DomainUrl = t,
                        le.domainUrl = n
                    }
                    le.URL_PARAMS = e
                }
            }
            )(),
            window.removeEventListener("resize", Y)
        }
        );
        const X = () => {
            if ("hidden" === document.visibilityState) {
                if (ae.log("app.vue -> 游戏 ,切后台", ee.CommonUtils.getTimer()),
                le.FOCUS = !1,
                ee.NoticeCenter.sendNotify(Le.GAME_PAUSE),
                ee.NoticeCenter.sendNotify(Le.GAME_HIDE_BACK, !0),
                P = ee.CommonUtils.getTimer(),
                N && clearTimeout(N),
                le.GAME_IS_PAUSED = !0,
                ee.SoundManager.stopAllMusic(),
                ee.GameVideo.enableAudio(!1),
                ee.LiveVideo.enableAudio(!1),
                ee.CommonUtils.isIos()) {
                    const {ctx: e} = k.Howler;
                    e && "running" === e.state && e.suspend()
                }
            } else
                F()
        }
        ;
        g( () => {
            te.instance().init(),
            ne.init();
            let e = null
              , t = !1;
            (async () => {
                var e;
                if (ee.AnalysisUrlUtils.checkUrlParams()) {
                    const t = ee.AnalysisUrlUtils.getLoginData();
                    if (le.customBrandLogo = null == (e = t.params) ? void 0 : e.blogo,
                    t.params && t.params.brandType && (le.LOGOTYPE = t.params.brandType),
                    t.params && t.params.zhuGeSwitch && (le.zhuGeSwitch = t.params.zhuGeSwitch),
                    t.params && t.params.shenjiSitch && (le.isShenJi = 0 != t.params.shenjiSitch),
                    le.ISSKGBACKSHOW = !(!t.params || !t.params.placeTypeId),
                    oe.playerId = t.playerId,
                    oe.jwtToken = t.jwtToken,
                    t.params.backendDomainUrl) {
                        const e = t.params.backendDomainUrl.trim();
                        le.socketServer = `wss://wsproxy.${e}`,
                        ae.info("tag=GameConst.socketServer2", le.socketServer),
                        le.httpServer = `https://gateway.${e}/game-http/`
                    }
                    if (t && t.params) {
                        const e = ee.LocalStoreUtils.getDemoAccountId()
                          , n = 2 == Number(t.params.agentId);
                        te.instance().isTryAccount = n,
                        n && oe.playerId != e && (x.value = !0,
                        localStorage.clear())
                    }
                } else
                    oe.playerId = 488283;
                return window.newPlayerId = oe.playerId,
                new Promise( (e, t) => {
                    x.value ? e(!0) : oe.jwtToken && te.instance().getHttpCacheData(oe.playerId).then(t => {
                        e(t)
                    }
                    ).catch(e => {
                        t(e)
                    }
                    )
                }
                )
            }
            )().then(n => {
                t && (clearTimeout(e),
                K())
            }
            ).catch(n => {
                t && (clearTimeout(e),
                K())
            }
            ),
            e && clearTimeout(e),
            e = setTimeout( () => {
                t = !0,
                K()
            }
            , 5e3);
            const n = .01 * window.innerHeight;
            document.documentElement.style.setProperty("--vh", `${n}px`),
            Y(),
            window.addEventListener("resize", $),
            document.addEventListener("visibilitychange", X),
            ae.init()
        }
        );
        const F = () => {
            if (le.FOCUS = !0,
            ee.NoticeCenter.sendNotify(Le.GAME_HIDE_BACK, !1),
            le.NEED_DELAY && ee.CommonUtils.getTimer() - P <= 3e3)
                N = setTimeout( () => {
                    F()
                }
                , 200);
            else if (window.document && document.documentElement.focus(),
            le.NEED_DELAY = !0,
            ae.log("app.vue -> 游戏 ,恢复", ee.CommonUtils.getTimer()),
            ee.NoticeCenter.sendNotify(Le.GAME_RESUME),
            le.OPEN_WEB)
                window.dispatchEvent(new Event(ve.BLUR));
            else if (le.GAME_IS_PAUSED) {
                if (le.GAME_IS_PAUSED = !1,
                ee.CommonUtils.getTimer() - P >= 18e5) {
                    ee.PresenterManager.clearScene();
                    const e = {
                        title: "@sys_00003",
                        content: "@tips_10619",
                        sureText: "@msg_10465",
                        notAutoClose: !0,
                        hideCancelBtn: !0,
                        maskClose: !1,
                        showCloseBtn: !1,
                        sureCallback: () => {
                            window.location.reload()
                        }
                        ,
                        cancelCallback: () => {
                            window.location.reload()
                        }
                    };
                    return void ee.Pop.showConfirm(e)
                }
                le.OPEN_VEO || (J(),
                ee.GameVideo.enableAudio(ee.GameVideo.getStatus() >= _e.PLAY && !!ye.SCENE_AUDIO))
            }
        }
        ;
        h( () => {
            document.removeEventListener("visibilitychange", X)
        }
        );
        const J = () => {
            if (le.RESLOADED && !le.OPEN_VEO) {
                if (ee.CommonUtils.isIos()) {
                    const {ctx: e} = k.Howler;
                    e && setTimeout( () => {
                        e.resume()
                    }
                    , 100)
                }
                ee.SoundManager.resumeAllMusic()
            }
        }
        ;
        return window.onstorage = function(e) {
            if ("tabKey" == e.key && (e.oldValue,
            e.newValue),
            "loginRecord" == e.key) {
                const t = e.oldValue || ""
                  , n = e.newValue || ""
                  , a = t.split("-")
                  , o = n.split("-")
                  , s = a[0]
                  , i = o[0]
                  , r = a[1]
                  , l = o[1];
                s && i && s == i && r != l && parseInt(s) == oe.playerId && ee.NoticeCenter.sendNotify(se.RUSH_LOGIN)
            }
        }
        ,
        localStorage.setItem("tabKey", window.tabKey),
        window.onbeforeunload = function() {
            ee.PresenterManager.clearScene()
        }
        ,
        window.onunload = function() {
            ee.PresenterManager.clearScene()
        }
        ,
        (e, t) => {
            const n = f("router-view")
              , a = f("el-config-provider");
            return v(M) ? (_(),
            L("div", {
                key: 0,
                id: "Application",
                class: "app"
            }, [(_(),
            L("svg", {
                width: "0",
                height: "0",
                style: {
                    position: "absolute",
                    "z-index": "-1"
                }
            }, [b("defs", null, [b("filter", {
                id: "grayFilter"
            }, [b("feColorMatrix", {
                type: "matrix",
                values: "0.3, 0.6, 0, 0, 0, 0.3, 0.6, 0, 0, 0, 0.3, 0.6, 0, 0, 0, 0, 0, 0, 0.5, 0"
            })]), b("linearGradient", {
                id: "paint0_linear_7343_63182",
                x1: "0",
                y1: "0",
                x2: "0",
                y2: "16",
                gradientUnits: "userSpaceOnUse"
            }, [b("stop", {
                "stop-color": "white"
            }), b("stop", {
                offset: "1",
                "stop-color": "white",
                "stop-opacity": "0.600173"
            })]), b("mask", {
                id: "mask0_7343_63182",
                style: {
                    "mask-type": "alpha"
                },
                maskUnits: "userSpaceOnUse",
                x: "0",
                y: "0",
                width: "16",
                height: "16"
            }, [b("circle", {
                cx: "8",
                cy: "8",
                r: "8",
                fill: "url(#paint0_linear_7343_63182)"
            })]), b("clipPath", {
                id: "pokerBgClipPath"
            }, [b("rect", {
                x: "16",
                y: "16",
                width: "208",
                height: "303",
                fill: "#ffffff"
            })]), b("clipPath", {
                id: "pokerBgClipPath2"
            }, [b("rect", {
                x: "16",
                y: "16",
                width: "88",
                height: "303",
                fill: "#ffffff"
            })]), b("path", {
                id: "pokerBgLine",
                d: "M-65 -70L-65 400L-52 -65L-52 400L-39 400L-39 -65L-26 -65L-26 400L-13 400L-13 -65L0 -65L0 400L13 400L13 -65L26 -65L26 400L39 400L39 -65L52 -65L52 400L65 400L65 -65L78 -65L78 400L91 400L91 -65L104 -65L104 400L117 400L117 -65L130 -65L130 400L143 400L143 -65L156 -65L156 400L169 400L169 -65L182 -65L182 400L195 400L195 -65L208 -65L208 400L221 400L221 -65L234 -65L234 400L247 400L247 -65L260 -65L260 400L273 400L273 -65L286 -65L286 400L299 400L299 -65L312 -65L312 400"
            })])])), H.value ? (_(),
            y(ie, {
                key: 0,
                loadConfig: O.value,
                onComplete: V
            }, null, 8, ["loadConfig"])) : w("", !0), H.value ? w("", !0) : (_(),
            L(S, {
                key: 1
            }, [E(re), (_(),
            y(U, {
                to: "body"
            }, [v(le).isSport ? w("", !0) : (_(),
            y(de, {
                key: 0
            }))]))], 64)), E(a, {
                locale: v(D)
            }, {
                default: A( () => [H.value ? w("", !0) : (_(),
                y(n, {
                    key: 0
                }))]),
                _: 1
            }, 8, ["locale"]), (_(),
            y(U, {
                to: "body"
            }, [E(ce)])), E(ue)])) : (_(),
            L(S, {
                key: 1
            }, [v(null) ? (_(),
            y(C(v(null)), {
                key: 0
            })) : w("", !0)], 64))
        }
    }
}), [["__scopeId", "data-v-d6923790"]])
  , Ie = "START_TIME"
  , Te = {
    created(e, t, n, a) {},
    beforeMount(e, t, n, a) {},
    mounted(e, t, n, a) {
        if ("function" != typeof t.value)
            throw "callback must be a function";
        e.__handleStart__ = n => {
            e[Ie] = Date.now(),
            setTimeout( () => {
                e[Ie] && ye.isLongTouch(e[Ie]) && (delete e[Ie],
                n.isLongTouch = !0,
                t.value(n),
                ee.SoundManager.playOperateAudio(n[Se.TAP_AUDIO_ID]))
            }
            , le.betConfig.enterTime)
        }
        ,
        e.__handleEnd__ = n => {
            e[Ie] && (n.isLongTouch = ye.isLongTouch(e[Ie]),
            delete e[Ie],
            n.isLongTouch && (t.value(n),
            ee.SoundManager.playOperateAudio(n[Se.TAP_AUDIO_ID])))
        }
        ,
        e.addEventListener("mousedown", e.__handleStart__),
        e.addEventListener("touchstart", e.__handleStart__),
        e.addEventListener("click", e.__handleEnd__),
        e.addEventListener("mouseout", e.__handleEnd__),
        e.addEventListener("touchend", e.__handleEnd__)
    },
    beforeUpdate(e, t, n, a) {},
    updated(e, t, n, a) {},
    beforeUnmount(e, t, n, a) {
        e.removeEventListener("mousedown", e.__handleStart__),
        e.removeEventListener("touchstart", e.__handleStart__),
        e.removeEventListener("click", e.__handleEnd__),
        e.removeEventListener("mouseout", e.__handleEnd__),
        e.removeEventListener("touchend", e.__handleEnd__)
    },
    unmounted(e, t, n, a) {}
}
  , De = {
    created(e, t, n, a) {},
    beforeMount(e, t, n, a) {},
    mounted(e, t, n, a) {
        e._soundClick = t => {
            if ((e.contains(t.target) || e === t.target) && !t[Se.TAP_AUDIO_DISABLE])
                try {
                    ee.SoundManager.playOperateAudio(t[Se.TAP_AUDIO_ID] || 10001),
                    t[Se.TAP_AUDIO_DISABLE] = !0,
                    t[Se.TAP_AUDIO_ID] = void 0
                } catch (n) {
                    ae.info("因为点击触发的音频播放失败：" + n)
                }
        }
        ,
        document.addEventListener("click", e._soundClick)
    },
    beforeUpdate(e, t, n, a) {},
    updated(e, t, n, a) {},
    beforeUnmount(e, t, n, a) {
        document.removeEventListener("click", e._soundClick),
        delete e._soundClick
    },
    unmounted(e, t, n, a) {}
}
  , Ne = {
    created(e, t, n, a) {},
    beforeMount(e, t, n, a) {},
    mounted(e, t, n, a) {
        e.style.display = "none",
        e._onLoad = () => {
            e.style.display = "block"
        }
        ,
        e.addEventListener("load", e._onLoad)
    },
    beforeUpdate(e, t, n, a) {},
    updated(e, t, n, a) {},
    beforeUnmount(e, t, n, a) {
        e.removeEventListener("load", e._onLoad),
        delete e._onLoad
    },
    unmounted(e, t, n, a) {}
};
let Pe = null
  , He = !1;
function Oe() {
    He && (He = !1)
}
const xe = {
    created(e, t, n, a) {},
    beforeMount(e, t, n, a) {},
    mounted(e, t, n, a) {
        let o, s;
        He = !1;
        const i = t.arg || "both";
        function r(e) {
            He = !0,
            o = e.clientX,
            s = e.clientY
        }
        function l(t) {
            if (He) {
                const n = t.clientX - o
                  , a = t.clientY - s;
                "horizontal" !== i && "both" !== i || (e.scrollLeft -= n),
                "vertical" !== i && "both" !== i || (e.scrollTop -= a),
                (n || a) && e.setAttribute("data-scroll-type", "grab"),
                o = t.clientX,
                s = t.clientY
            }
        }
        function d() {
            Pe && clearTimeout(Pe),
            Pe = setTimeout( () => {
                e.setAttribute("data-scroll-type", "")
            }
            , 0),
            He = !1
        }
        e.addEventListener("mouseover", () => {
            e.children.length > 2 && (e.style.cursor = "grab")
        }
        ),
        e.addEventListener("mousedown", r),
        e.addEventListener("mousemove", l),
        e.addEventListener("mouseup", d),
        document.addEventListener("mouseup", Oe),
        e.addEventListener("hook:destroyed", () => {
            e.removeEventListener("mousedown", r),
            e.removeEventListener("mousemove", l),
            e.removeEventListener("mouseup", d),
            document.removeEventListener("mouseup", Oe),
            e.removeEventListener("mouseover", () => {}
            ),
            Pe && clearTimeout(Pe)
        }
        )
    },
    beforeUpdate(e, t, n, a) {},
    updated(e, t, n, a) {},
    beforeUnmount(e, t, n, a) {},
    unmounted(e, t, n, a) {}
}
  , Me = {
    created(e, t, n, a) {},
    beforeMount(e, t, n, a) {},
    mounted(e, t, n, a) {
        e.style.cursor = "move",
        e.style.position = "absolute",
        e.onmousedown = function(t) {
            let n = t.pageX - e.offsetLeft
              , a = t.pageY - e.offsetTop;
            e.onmousemove = function(t) {
                let o, s, i = t.pageX - n, r = t.pageY - a;
                o = e.parentNode.offsetWidth - e.offsetWidth,
                s = e.parentNode.offsetHeight - e.offsetHeight,
                i < 0 ? i = 0 : i > o && (i = o),
                r < 0 ? r = 0 : r > s && (r = s),
                e.style.left = i + "px",
                e.style.top = r + "px"
            }
            ,
            e.onmouseup = function() {
                e.onmousemove = e.onmouseup = null
            }
        }
    },
    beforeUpdate(e, t, n, a) {},
    updated(e, t, n, a) {},
    beforeUnmount(e, t, n, a) {},
    unmounted(e, t, n, a) {}
}
  , je = new WeakMap
  , Ge = new ResizeObserver(e => {
    for (const t of e) {
        const e = je.get(t.target);
        null == e || e({
            width: t.borderBoxSize[0].inlineSize,
            height: t.borderBoxSize[0].blockSize
        })
    }
}
)
  , We = {
    mounted(e, t) {
        t.value && (je.set(e, t.value),
        Ge.observe(e))
    },
    unmounted(e, t) {
        t.value && Ge.unobserve(e)
    }
}
  , Be = Object.getOwnPropertyDescriptor(URL.prototype, "href");
Object.defineProperty(URL.prototype, "href", {
    get() {
        const e = Be.get.call(this);
        return (null == e ? void 0 : e.match(/^https?:\/\//)) ? this.pathname : e
    }
});
const Re = T(ke);
window.app = Re,
Re.provide("useWindowSize", Ue()),
Re.use(D),
ae.log(D.version),
Re.use(Ae),
Re.use(N),
Re.use(Ce),
Re.use(P),
Re.use(H),
Re.use(O),
Re.use(x),
Re.use(M),
Re.use(j),
Re.use(G),
Re.use(W),
Re.use(B),
Re.use(R),
Re.use(z),
Re.use(V),
Re.use(K),
Re.use(Y),
Re.use($),
Re.use(X),
Re.use(F),
Re.use(J),
Re.use(Z),
Re.use(q),
Re.directive("long-tap", Te),
Re.directive("sound-click", De),
Re.directive("error-img", Ne),
Re.directive("drag-scroll", xe),
Re.directive("draggable", Me),
Re.directive("size-ob", We),
Ce.isReady().then( () => {
    Re.mount("#app")
}
);
