window.openFhirApps = function () {
    $.getJSON("/webjars/fhirapps/asset-manifest.json", function (json) {
        json.entrypoints.forEach(function (url) {
            var extension = url.substr(url.lastIndexOf('.') + 1);
            if (extension === 'css') {
                var oldLink = document.querySelector(`link[href="/webjars/fhirapps/${url}"][rel=stylesheet]`)
                if (oldLink !== null) return
                var link = document.createElement('link');
                link.setAttribute('href', "/webjars/fhirapps/" + url);
                link.setAttribute('rel', 'stylesheet');
                document.getElementsByTagName("head")[0].appendChild(link);
            }
        });
        json.entrypoints.forEach(function (url) {
            var extension = url.substr(url.lastIndexOf('.') + 1);
            if (extension !== 'css') {
                var oldBundle = document.querySelector(`script[src="/webjars/fhirapps/${url}"]`)
                if (oldBundle !== null) return
                var bundle = document.createElement('script');
                bundle.setAttribute('src', "/webjars/fhirapps/" + url);
                document.body.appendChild(bundle);
            }
        });
    });

    if (window.fhirAppsOpenRef && window.fhirAppsOpenRef.current) {
        window.fhirAppsOpenRef.current()
    }
}