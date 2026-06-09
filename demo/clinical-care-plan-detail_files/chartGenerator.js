(function () {
    /**
     * Function to wrap C3/D3 or whatever tech generates charts, options override defauls (if any)
     * @param {object} options See C3 options
     * @param {string} title Title for chart (c3 supports titles in v0.4)
     * @param {string} palette Key for which system palette to use, defauls to DEFAULT
     * @param {string} subtitle Smaller title with more room
     */
    function pccGenerateChart (options, title, palette, subtitle) {
        var PCC_CHART_COLORS        = {};
        PCC_CHART_COLORS.DEFAULT    = ['#0b596b','#007691','#2AB460','#F8C536','#CC8720','#CE4A08','#9B0017','#68143E'];
        PCC_CHART_COLORS.STATUS     = ['#33ff6d','#6ffe5c','#a8fe4c','#e3fd3b','#ffdf3c','#ffa54c','#ff6b5d','#ff336d'];
        PCC_CHART_COLORS.MONOCHROME = ['#006eff','#1f80ff','#3f92ff','#5fa4ff','#7fb6ff','#9fc9ff','#bfdcff','#dfeeff'];
        var colorPalette            = PCC_CHART_COLORS[palette] || PCC_CHART_COLORS.DEFAULT;
        var finalOptions            = $.extend(true, {}, options);
        
        //################################################ 
        // OPTION REMAPPINGS
        //################################################ 
        if (!finalOptions.color) {
            finalOptions.color = {
                pattern: colorPalette
            };
        }
        if (!finalOptions.grid) {
            finalOptions.grid = {
                y: {
                    show: true
                }
            };
        }

        //################################################ 
        // DOM GENERATION
        //################################################ 
        var outerEl = $(finalOptions.bindto);
        var innerEl = $('<div class="pccChartWrapper" />');
        var titles = $('<div class="pccChartTitleContainer" />');
        
        if (title || subtitle) {
            if (title) {
                titles.append($('<div class="pccChartTitle">' + title + '</div>'));
            }
            if (subtitle) {
                titles.append($('<div class="pccChartSubTitle">' + subtitle + '</div>'));
            }
            outerEl.prepend(titles);
        }
        
        outerEl.addClass('pccChart').append(innerEl);
        finalOptions.bindto = innerEl[0];
        var chart = c3.generate(finalOptions);
        return chart;
    }

    $.fn.pccGenerateChart = function (options) {
        options.bindto = this;
        return pccGenerateChart.apply(this, arguments);
    };

}());
