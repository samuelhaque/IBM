import _isEmpty from 'lodash-es/isEmpty';
import { t } from '../util/locale';


// https://github.com/openstreetmap/josm/blob/mirror/src/org/
// openstreetmap/josm/data/validation/tests/UnclosedWays.java#L80
export function validationTagSuggestsArea() {

    function tagSuggestsArea(tags) {
        if (_isEmpty(tags)) return false;

        var presence = ['landuse', 'amenities', 'tourism', 'shop'];
        for (var i = 0; i < presence.length; i++) {
            if (tags[presence[i]] !== undefined) {
                if (presence[i] === 'tourism' && tags[presence[i]] === 'artwork') {
                    continue;   // exception for tourism=artwork - #5206
                } else {
                    return presence[i] + '=' + tags[presence[i]];
                }
            }
        }

        if (tags.building && tags.building === 'yes') return 'building=yes';
    }


    var validation = function(changes, graph) {
        var warnings = [];
        for (var i = 0; i < changes.created.length; i++) {
            var change = changes.created[i];
            var geometry = change.geometry(graph);
            var suggestion = (geometry === 'line' ? tagSuggestsArea(change.tags) : undefined);

            if (suggestion) {
                warnings.push({
                    id: 'tag_suggests_area',
                    message: t('validations.tag_suggests_area', { tag: suggestion }),
                    entity: change
                });
            }
        }

        return warnings;
    };


    return validation;
}
