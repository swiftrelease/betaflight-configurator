import { i18n } from "../localization";
import GUI, { TABS } from '../gui';
import { reinitializeConnection } from "../serial_backend";
import { mspHelper } from "../msp/MSPHelper";
import MSP from "../msp";
import FC from "../fc";
import MSPCodes from "../msp/MSPCodes";
import adjustBoxNameIfPeripheralWithModeID from "../peripherals";
import { API_VERSION_1_43, API_VERSION_1_44, API_VERSION_1_45 } from "../data_storage";
import { gui_log } from "../gui_log";
import semver from 'semver';

const failsafe = {};

failsafe.initialize = function (callback) {

    if (GUI.active_tab != 'failsafe') {
        GUI.active_tab = 'failsafe';
    }

    function load_rx_config() {
        MSP.send_message(MSPCodes.MSP_RX_CONFIG, false, false, load_failssafe_config);
    }

    function load_failssafe_config() {
        MSP.send_message(MSPCodes.MSP_FAILSAFE_CONFIG, false, false, load_rxfail_config);
    }

    function load_rxfail_config() {
        MSP.send_message(MSPCodes.MSP_RXFAIL_CONFIG, false, false, load_gps_rescue);
    }

    function load_gps_rescue() {
        MSP.send_message(MSPCodes.MSP_GPS_RESCUE, false, false, get_box_names);
    }

    function get_box_names() {
        MSP.send_message(MSPCodes.MSP_BOXNAMES, false, false, get_mode_ranges);
    }

    function get_mode_ranges() {
        MSP.send_message(MSPCodes.MSP_MODE_RANGES, false, false, get_box_ids);
    }

    function get_box_ids() {
        MSP.send_message(MSPCodes.MSP_BOXIDS, false, false, get_ports_config);
    }

    function get_ports_config() {
        mspHelper.loadSerialConfig(get_rc_data);
    }

    function get_rc_data() {
        MSP.send_message(MSPCodes.MSP_RC, false, false, get_rssi_config);
    }

    function get_rssi_config() {
        MSP.send_message(MSPCodes.MSP_RSSI_CONFIG, false, false, load_feature_config);
    }

    function load_feature_config() {
        MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false, load_motor_config);
    }

    function load_motor_config() {
        MSP.send_message(MSPCodes.MSP_MOTOR_CONFIG, false, false, load_gps_config);
    }

    function load_gps_config() {
        MSP.send_message(MSPCodes.MSP_GPS_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/failsafe.html", process_html);
    }


    load_rx_config();

    function process_html() {
        // fill stage 2 fields
        function toggleStage2(doShow) {
            if (doShow) {
                $('div.stage2').show();
            } else {
                $('div.stage2').hide();
            }
        }

        // FIXME cleanup oldpane html and css
        const oldPane = $('div.oldpane');
        oldPane.prop("disabled", true);
        oldPane.hide();

        // generate labels for assigned aux modes
        const auxAssignment = [];

        let element;

        for (let channelIndex = 0; channelIndex < FC.RC.active_channels - 4; channelIndex++) {
            auxAssignment.push("");
        }

        if (typeof FC.RSSI_CONFIG.channel !== 'undefined')  {
            auxAssignment[FC.RSSI_CONFIG.channel - 5] += "<span class=\"modename\">" + "RSSI" + "</span>";         // Aux channels start at 5 in backend so we have to substract 5
        }

        for (let modeIndex = 0; modeIndex < FC.AUX_CONFIG.length; modeIndex++) {

            const modeId = FC.AUX_CONFIG_IDS[modeIndex];

            // scan mode ranges to find assignments
            for (let modeRangeIndex = 0; modeRangeIndex < FC.MODE_RANGES.length; modeRangeIndex++) {
                const modeRange = FC.MODE_RANGES[modeRangeIndex];

                if (modeRange.id != modeId) {
                    continue;
                }

                const range = modeRange.range;
                if (range.start >= range.end) {
                    continue; // invalid!
                }

                // Search for the real name if it belongs to a peripheral
                let modeName = FC.AUX_CONFIG[modeIndex];
                modeName = adjustBoxNameIfPeripheralWithModeID(modeId, modeName);

                auxAssignment[modeRange.auxChannelIndex] += `<span class="modename">${modeName}</span>`;
            }
        }

        // generate full channel list
        const channelNames = [
                i18n.getMessage('controlAxisRoll'),
                i18n.getMessage('controlAxisPitch'),
                i18n.getMessage('controlAxisYaw'),
                i18n.getMessage('controlAxisThrottle'),
            ],
            fullChannels_e = $('div.activechannellist');
        let aux_index = 1,
            aux_assignment_index = 0;

        for (let i = 0; i < FC.RXFAIL_CONFIG.length; i++) {
            if (i < channelNames.length) {
                fullChannels_e.append(`\
                    <div class="number">\
                        <div class="channelprimary">\
                            <span>${channelNames[i]}</span>\
                        </div>\
                        <div class="cf_tip channelsetting" title="${i18n.getMessage("failsafeChannelFallbackSettingsAuto")}">\
                            <select class="aux_set" id="${i}">\
                                <option value="0">Auto</option>\
                                <option value="1">Hold</option>\
                                <option value="2">Set</option>\
                            </select>\
                        </div>\
                        <div class="auxiliary"><input type="number" name="aux_value" min="750" max="2250" step="25" id="${i}"/></div>\
                    </div>\
                `);
            } else {
                const messageKey = `controlAxisAux${aux_index++}`;
                fullChannels_e.append(`\
                    <div class="number">\
                        <div class="channelauxiliary">\
                            <span class="channelname">${i18n.getMessage(messageKey)}</span>\
                            ${auxAssignment[aux_assignment_index++]}\
                        </div>\
                        <div class="cf_tip channelsetting" title="${i18n.getMessage("failsafeChannelFallbackSettingsHold")}">\
                            <select class="aux_set" id="${i}">\
                                <option value="1">Hold</option>\
                                <option value="2">Set</option>\
                            </select>\
                        </div>\
                        <div class="auxiliary"><input type="number" name="aux_value" min="750" max="2250" step="25" id="${i}"/></div>\
                    </div>\
                `);
            }
        }

        const channel_mode_array = [];
        $('.number', fullChannels_e).each(function () {
            channel_mode_array.push($('select.aux_set' , this));
        });

        const channel_value_array = [];
        $('.number', fullChannels_e).each(function () {
            channel_value_array.push($('input[name="aux_value"]' , this));
        });

        const channelMode = $('select.aux_set');
        const channelValue = $('input[name="aux_value"]');

        // UI hooks
        channelMode.change(function () {
            const currentMode = parseInt($(this).val());
            const i = parseInt($(this).prop("id"));
            FC.RXFAIL_CONFIG[i].mode = currentMode;
            if (currentMode == 2) {
                channel_value_array[i].prop("disabled", false);
                channel_value_array[i].show();
            } else {
                channel_value_array[i].prop("disabled", true);
                channel_value_array[i].hide();
            }
        });

        // UI hooks
        channelValue.change(function () {
            const i = parseInt($(this).prop("id"));
            FC.RXFAIL_CONFIG[i].value = parseInt($(this).val());
        });

        // fill stage 1 Valid Pulse Range Settings
        $('input[name="rx_min_usec"]').val(FC.RX_CONFIG.rx_min_usec);
        $('input[name="rx_max_usec"]').val(FC.RX_CONFIG.rx_max_usec);

        // fill fallback settings (mode and value) for all channels
        for (let i = 0; i < FC.RXFAIL_CONFIG.length; i++) {
            channel_value_array[i].val(FC.RXFAIL_CONFIG[i].value);
            channel_mode_array[i].val(FC.RXFAIL_CONFIG[i].mode);
            channel_mode_array[i].change();
        }

        FC.FEATURE_CONFIG.features.generateElements($('.tab-failsafe .featuresNew'));

        $('tbody.rxFailsafe').hide();
        toggleStage2(true);

        $('input[name="failsafe_throttle"]').val(FC.FAILSAFE_CONFIG.failsafe_throttle);
        $('input[name="failsafe_off_delay"]').val((FC.FAILSAFE_CONFIG.failsafe_off_delay / 10.0).toFixed(1));
        $('input[name="failsafe_throttle_low_delay"]').val((FC.FAILSAFE_CONFIG.failsafe_throttle_low_delay / 10.0).toFixed(1));
        $('input[name="failsafe_delay"]').val((FC.FAILSAFE_CONFIG.failsafe_delay / 10.0).toFixed(1));

        // set stage 2 failsafe procedure
        $('input[type="radio"].procedure').change(function () {
            // Disable all the settings
            $('.proceduresettings :input').attr('disabled',true);
            // Enable only selected
            $(this).parent().parent().find(':input').attr('disabled',false);
        });

        switch(FC.FAILSAFE_CONFIG.failsafe_procedure) {
            case 0:
                element = $('input[id="land"]') ;
                element.prop('checked', true);
                element.change();
                break;
            case 1:
                element = $('input[id="drop"]');
                element.prop('checked', true);
                element.change();
                break;
            case 2:
                element = $('input[id="gps_rescue"]');
                element.prop('checked', true);
                element.change();
                break;
            case 3:
                element = $('input[id="compass_rescue"]');
                element.prop('checked', true);
                element.change();
                break;
        }

        // Sort the element, if need to group, do it by lexical sort, ie. by naming of (the translated) selection text
        $('#failsafeSwitchSelect').sortSelect();

        // `failsafe_kill_switch` has been renamed to `failsafe_switch_mode`.
        // It is backwards compatible with `failsafe_kill_switch`
        $('select[name="failsafe_switch_mode"]').val(FC.FAILSAFE_CONFIG.failsafe_switch_mode);
        $('div.kill_switch').hide();

        // The GPS Rescue tab is only available for 1.40 or later, and the parameters for 1.41

        // Load GPS Rescue parameters
        $('input[name="gps_rescue_angle"]').val(FC.GPS_RESCUE.angle);
        $('input[name="gps_rescue_initial_altitude"]').val(FC.GPS_RESCUE.initialAltitudeM);
        $('input[name="gps_rescue_descent_distance"]').val(FC.GPS_RESCUE.descentDistanceM);
        $('input[name="gps_rescue_ground_speed"]').val((FC.GPS_RESCUE.rescueGroundspeed / 100).toFixed(2));
        $('input[name="gps_rescue_throttle_min"]').val(FC.GPS_RESCUE.throttleMin);
        $('input[name="gps_rescue_throttle_max"]').val(FC.GPS_RESCUE.throttleMax);
        $('input[name="gps_rescue_throttle_hover"]').val(FC.GPS_RESCUE.throttleHover);
        $('input[name="gps_rescue_min_sats"]').val(FC.GPS_RESCUE.minSats);
        // Sort the element, if need to group, do it by lexical sort, ie. by naming of (the translated) selection text
        $('#failsafeGpsRescueItemSanitySelect').sortSelect();
        $('select[name="gps_rescue_sanity_checks"]').val(FC.GPS_RESCUE.sanityChecks);

        // Sort the element, if need to group, do it by lexical sort, ie. by naming of (the translated) selection text
        $('#failsafeGpsRescueItemAltitudeSelect').sortSelect();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            $('input[name="gps_rescue_ascend_rate"]').val((FC.GPS_RESCUE.ascendRate / 100).toFixed(2));
            $('input[name="gps_rescue_descend_rate"]').val((FC.GPS_RESCUE.descendRate / 100).toFixed(2));
            $('input[name="gps_rescue_allow_arming_without_fix"]').prop('checked', FC.GPS_RESCUE.allowArmingWithoutFix > 0);
            $('select[name="gps_rescue_altitude_mode"]').val(FC.GPS_RESCUE.altitudeMode);
        } else {
            $('input[name="gps_rescue_ascend_rate"]').closest('.number').hide();
            $('input[name="gps_rescue_descend_rate"]').closest('.number').hide();
            $('input[name="gps_rescue_allow_arming_without_fix"]').closest('.number').hide();
            $('select[name="gps_rescue_altitude_mode"]').closest('.number').hide();
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            $('input[name="gps_rescue_min_dth"]').val(FC.GPS_RESCUE.minRescueDth);
        } else {
            $('input[name="gps_rescue_min_dth"]').closest('.number').hide();
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
            $('input[name="gps_rescue_min_dth"]').attr("min", 20);
        }

        // Load compass rescue params
        $('input[name="compass_rescue_direction"]').val(FC.COMPASS_RESCUE.direction);
        $('input[name="compass_rescue_angle"]').val(FC.COMPASS_RESCUE.angle);
        $('input[name="compass_rescue_ascend_rate"]').val(FC.COMPASS_RESCUE.ascendRate);
        $('input[name="compass_rescue_initial_altitude"]').val(FC.COMPASS_RESCUE.rescueAltitudeBufferM);
        $('input[name="compass_rescue_min_return_altitude"]').val(FC.COMPASS_RESCUE.minReturnAltitudeM);
        $('input[name="compass_rescue_throttle_min"]').val(FC.COMPASS_RESCUE.throttleMin);
        $('input[name="compass_rescue_throttle_max"]').val(FC.COMPASS_RESCUE.throttleMax);
        $('input[name="compass_rescue_throttle_hover"]').val(FC.COMPASS_RESCUE.throttleHover);
        $('select[name="compass_rescue_altitude_mode"]').val(FC.COMPASS_RESCUE.altitudeMode);

        $('a.save').click(function () {
            // gather data that doesn't have automatic change event bound

            FC.FEATURE_CONFIG.features.updateData($('input[name="FAILSAFE"]'));

            FC.RX_CONFIG.rx_min_usec = parseInt($('input[name="rx_min_usec"]').val());
            FC.RX_CONFIG.rx_max_usec = parseInt($('input[name="rx_max_usec"]').val());

            FC.FAILSAFE_CONFIG.failsafe_throttle = parseInt($('input[name="failsafe_throttle"]').val());
            FC.FAILSAFE_CONFIG.failsafe_off_delay = Math.round(10.0 * parseFloat($('input[name="failsafe_off_delay"]').val()));
            FC.FAILSAFE_CONFIG.failsafe_throttle_low_delay = Math.round(10.0 * parseFloat($('input[name="failsafe_throttle_low_delay"]').val()));
            FC.FAILSAFE_CONFIG.failsafe_delay = Math.round(10.0 * parseFloat($('input[name="failsafe_delay"]').val()));

            if( $('input[id="land"]').is(':checked')) {
                FC.FAILSAFE_CONFIG.failsafe_procedure = 0;
            } else if( $('input[id="drop"]').is(':checked')) {
                FC.FAILSAFE_CONFIG.failsafe_procedure = 1;
            } else if( $('input[id="gps_rescue"]').is(':checked')) {
                FC.FAILSAFE_CONFIG.failsafe_procedure = 2;
            } else if ( $('input[id="compass_rescue"]').is(':checked')) {
                FC.FAILSAFE_CONFIG.failsafe_procedure = 3;
            }

            FC.FAILSAFE_CONFIG.failsafe_switch_mode = $('select[name="failsafe_switch_mode"]').val();

            // Load GPS Rescue parameters
            FC.GPS_RESCUE.angle             = $('input[name="gps_rescue_angle"]').val();
            FC.GPS_RESCUE.initialAltitudeM  = $('input[name="gps_rescue_initial_altitude"]').val();
            FC.GPS_RESCUE.descentDistanceM  = $('input[name="gps_rescue_descent_distance"]').val();
            FC.GPS_RESCUE.rescueGroundspeed = $('input[name="gps_rescue_ground_speed"]').val() * 100;
            FC.GPS_RESCUE.throttleMin       = $('input[name="gps_rescue_throttle_min"]').val();
            FC.GPS_RESCUE.throttleMax       = $('input[name="gps_rescue_throttle_max"]').val();
            FC.GPS_RESCUE.throttleHover     = $('input[name="gps_rescue_throttle_hover"]').val();
            FC.GPS_RESCUE.minSats           = $('input[name="gps_rescue_min_sats"]').val();
            FC.GPS_RESCUE.sanityChecks      = $('select[name="gps_rescue_sanity_checks"]').val();

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                FC.GPS_RESCUE.ascendRate = $('input[name="gps_rescue_ascend_rate"]').val() * 100;
                FC.GPS_RESCUE.descendRate = $('input[name="gps_rescue_descend_rate"]').val() * 100;
                FC.GPS_RESCUE.allowArmingWithoutFix = $('input[name="gps_rescue_allow_arming_without_fix"]').prop('checked') ? 1 : 0;
                FC.GPS_RESCUE.altitudeMode = parseInt($('select[name="gps_rescue_altitude_mode"]').val());
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                FC.GPS_RESCUE.minRescueDth = $('input[name="gps_rescue_min_dth"]').val();
            }

            FC.COMPASS_RESCUE.direction = $('input[name="compass_rescue_direction"]').val();
            FC.COMPASS_RESCUE.angle = $('input[name="compass_rescue_angle"]').val();
            FC.COMPASS_RESCUE.ascendRate = $('input[name="compass_rescue_ascend_rate"]').val();
            FC.COMPASS_RESCUE.rescueAltitudeBufferM = $('input[name="compass_rescue_initial_altitude"]').val();
            FC.COMPASS_RESCUE.minReturnAltitudeM = $('input[name="compass_rescue_min_return_altitude"]').val();
            FC.COMPASS_RESCUE.throttleMin = $('input[name="compass_rescue_throttle_min"]').val();
            FC.COMPASS_RESCUE.throttleMax = $('input[name="compass_rescue_throttle_max"]').val();
            FC.COMPASS_RESCUE.throttleHover = $('input[name="compass_rescue_throttle_hover"]').val();
            FC.COMPASS_RESCUE.altitudeMode = parseInt($('select[name="compass_rescue_altitude_mode"]').val());

            function save_failssafe_config() {
                MSP.send_message(MSPCodes.MSP_SET_FAILSAFE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FAILSAFE_CONFIG), false, save_rxfail_config);
            }

            function save_rxfail_config() {
                mspHelper.sendRxFailConfig(save_feature_config);
            }

            function save_feature_config() {
                MSP.send_message(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG), false, save_gps_rescue);
            }

            function save_gps_rescue() {
                MSP.send_message(MSPCodes.MSP_SET_GPS_RESCUE, mspHelper.crunch(MSPCodes.MSP_SET_GPS_RESCUE), false, save_to_eeprom);
            }

            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, reboot);
            }

            function reboot() {
                gui_log(i18n.getMessage('configurationEepromSaved'));

                GUI.tab_switch_cleanup(function() {
                    MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false, reinitializeConnection);
                });
            }

            MSP.send_message(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG), false, save_failssafe_config);
        });

        // translate to user-selected language
        i18n.localizePage();

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }
};

failsafe.cleanup = function (callback) {
    if (callback) callback();
};

TABS.failsafe = failsafe;
export {
    failsafe,
};
