!function(e){var t={};function n(r){if(t[r])return t[r].exports;var o=t[r]={i:r,l:!1,exports:{}};return e[r].call(o.exports,o,o.exports,n),o.l=!0,o.exports}n.m=e,n.c=t,n.d=function(e,t,r){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:r})},n.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.t=function(e,t){if(1&t&&(e=n(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var r=Object.create(null);if(n.r(r),Object.defineProperty(r,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var o in e)n.d(r,o,function(t){return e[t]}.bind(null,o));return r},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="",n(n.s=4)}({4:function(e,t){!function(){"use strict";var e=document.getElementsByClassName("wp-block-gutenberg-yandex-block-map");if(e.length>0)for(var t=function(t){var n=e[t],r=JSON.parse(n.dataset.params),o=(r.width,r.height,r.lat),a=r.lon,u=r.zoom,l=r.has_placemark,i=r.pm_balloon,f=r.pm_hint,c=r.pm_lat,p=r.pm_lon;"undefined"!=typeof ymaps&&ymaps.ready(function(){var e=new ymaps.Map(n,{center:[o,a],zoom:u});if(l){var t=new ymaps.Placemark([c,p],{hintContent:f,balloonContent:i});e.geoObjects.add(t)}})},n=0;n<e.length;n++)t(n)}()}});