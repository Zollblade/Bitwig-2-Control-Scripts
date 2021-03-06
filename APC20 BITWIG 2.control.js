/*
Bitwig 2.0.0 controller script for Akai APC20 (MK1)

latest version: https://github.com/lem8r/bitwig_apc20

version 1.1
*/


loadAPI(2);

host.defineController("Akai", "APC20", "1.0", "e91c25b0-b5de-11e3-a5e2-0800200c9a66");
host.defineMidiPorts(1, 1);
host.addDeviceNameBasedDiscoveryPair(["Akai APC20"], ["Akai APC20"]);
host.addDeviceNameBasedDiscoveryPair(["Akai APC20 MIDI 1"], ["Akai APC20 MIDI 1"]);

for (var i = 1; i < 20; i++) {
    var name = i.toString() + "- Akai APC20";
    host.addDeviceNameBasedDiscoveryPair([name], [name]);
    host.addDeviceNameBasedDiscoveryPair(["Akai APC20 MIDI " + i.toString()], ["Akai APC20 MIDI " + i.toString()]);
}

if (host.platformIsLinux()) {
    for (var i = 1; i < 16; i++) {
        host.addDeviceNameBasedDiscoveryPair(["Akai APC20 " + +i.toString() + " MIDI 1"], ["Akai APC20 " + +i.toString() + " MIDI 1"]);
    }
}

host.defineSysexIdentityReply("F0 7E ?? 06 02 47 7B 00 19 ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? F7");


var noteInput, applicationView, transportView, masterTrackView, tracksBankView, userControlBankView;

var SLOWPOKE_DELAY = 30; // ms to wait on mode switch

// Clip mode LEDs state
var noteMode, overdubMode, isPlaying, isRecording, shiftPressed;
var canScrollLeft, canScrollRight, canScrollUp, canScrollDown;
var clipHasContent = initArray(false, 40);
var clipIsPlaiyng = initArray(false, 40);
var clipIsRecording = initArray(false, 40);
var clipIsQueued = initArray(false, 40);
var fadersMode;
var selectedTrackIndex;
var clipSize;
var notifications;
var trackIsMuted = initArray(false, 8);
var trackIsSoloed = initArray(false, 8);
var trackIsArmed = initArray(false, 8);
var trackExists = initArray(true, 8);
var trackIsGroup = initArray(false, 8);
var trackIsMuted = initArray(false, 8);
var trackIsSoloed = initArray(false, 8);
var trackIsArmed = initArray(false, 8);
var trackExists = initArray(false, 8);

var applicationView;
var transportView;
var masterTrackView;
var tracksBankView;
var userControlBankView;
var cursorTrack;
var cursorDevice;
var cursUp = 0;
var cursDown = 0;
var clipLauncher

function APC_usleep(milliseconds) // it's so cold in this house (c) Bloc Party
{
    var start = new Date().getTime();
    while (new Date() < (start + milliseconds));
    return true;
}

function clearTransportAndTrackLeds() {
    for (var tr = 0; tr < 8; tr++) // Clear some LED just in case
    {
        sendMidi(0x80 | tr, 0x30, 0x00);
        sendMidi(0x80 | tr, 0x31, 0x00);
        sendMidi(0x80 | tr, 0x32, 0x00);
        sendMidi(0x80 | tr, 0x33, 0x00);
    }
    sendMidi(0x80, 0x50, 0x00);
}

function switchLEDStoNoteMode() {
    sendMidi(0x90, 0x50, 0x7F); // turn Note mode LED on
    isPlayingOb(isPlaying); // restore transport LEDs state
    isRecordingOb(isRecording);
    launcherOverdubOb(overdubMode);
    canScrollTracksUpOb(canScrollLeft);
    canScrollTracksDownOb(canScrollRight);
    canScrollScenesUpOb(canScrollUp);
    canScrollScenesDownOb(canScrollDown);
}

function switchLEDStoClipMode() {
    sendMidi(0x80, 0x50, 0x00); // turn LED off

    isPlayingOb(isPlaying); // restore transport LEDs state
    isRecordingOb(isRecording);
    launcherOverdubOb(overdubMode);
    canScrollTracksUpOb(canScrollLeft);
    canScrollTracksDownOb(canScrollRight);
    canScrollScenesUpOb(canScrollUp);
    canScrollScenesDownOb(canScrollDown);

    for (var scn = 0; scn < 5; scn++) // restore clip LEDs state
        for (var tr = 0; tr < 8; tr++) {
        clObF1 = getClipObserverFunc(tr, 1);
        clObF2 = getClipObserverFunc(tr, 2);
        clObF3 = getClipObserverFunc(tr, 3);
        clObF4 = getClipObserverFunc(tr, 4);

        clObF1(scn, clipHasContent[tr + scn * 8]);
        clObF2(scn, clipIsPlaiyng[tr + scn * 8]);
        clObF3(scn, clipIsRecording[tr + scn * 8]);
        clObF4(scn, clipIsQueued[tr + scn * 8]);
    }
}

function init() {
    noteMode = false;
    overdubMode = false;
    isPlaying = false;
    isRecording = false;
    shiftPressed = false;
    canScrollLeft = canScrollRight = canScrollUp = canScrollDown = false;
    fadersMode = 0;
    selectedTrackIndex = 0;
    clipSize = 4;
    notifications = true;

    sendSysex("F0 47 7F 7B 60 00 04 41 08 02 01 F7"); // Set Mode 1
    APC_usleep(SLOWPOKE_DELAY); // Sorry, scheduleTask is not working here since we have to stay in init()
    clearTransportAndTrackLeds();

    noteInput = host.getMidiInPort(0).createNoteInput("Akai APC20", "99????", "89????");

    applicationView = host.createApplication();
    transportView = host.createTransport();
    masterTrackView = host.createMasterTrack(5);
    tracksBankView = host.createMainTrackBank(8, 3, 5);
    //EDIT
    userControlBankView = host.createUserControls(17);
   
   
     //EDIT
	cursorTrack = host.createCursorTrack(3, 0);
	cursorDevice = cursorTrack.createCursorDevice();
    remoteControls = cursorDevice.createCursorRemoteControlsPage(8);

   //DEPRECIATED 
   // cursorTrack = host.createArrangerCursorTrack(3, 5);
   // cursorDevice = cursorTrack.createCursorDevice("Primary");
    
    // tracksBankView = cursorTrack.createSiblingsTrackBank(8, 3, 5, true, false);

    host.getMidiInPort(0).setMidiCallback(onMidi);
    host.getMidiInPort(0).setSysexCallback(onSysex);

    if (notifications) host.showPopupNotification("APC20 plugged in");

    transportView.addIsPlayingObserver(isPlayingOb);
    transportView.addIsRecordingObserver(isRecordingOb);
    transportView.addLauncherOverdubObserver(launcherOverdubOb);

    for (var t = 0; t < 8; t++) {
        var track = tracksBankView.getChannel(t);
        track.getVolume().addValueObserver(161, getTrackObFunc(t, 1));
        track.getMute().addValueObserver(getTrackObFunc(t, 2));
        track.getSolo().addValueObserver(getTrackObFunc(t, 3));
        track.getArm().addValueObserver(getTrackObFunc(t, 4));
        track.exists().addValueObserver(getTrackObFunc(t, 5));
        track.addIsSelectedObserver(getTrackObFunc(t, 6));
        track.addIsGroupObserver(getTrackObFunc(t, 7));

        for ( var i = 0; i < 8; i++)
        {
            var p = remoteControls.getParameter(i).getAmount();
            p.setIndication(true);
            p.setLabel("P" + (i + 1));
        }

        userControlBankView.getControl(t).setIndication(true);
        userControlBankView.getControl(t + 8).setIndication(true);
        
        
        
        //DEPRECIATED   for (var m = 0; m < 8; m++) cursorDevice.getCommonParameter(m).setIndication(true);
        track.getVolume().setIndication(true);
        track.getPan().setIndication(true);
        track.getSend(0).setIndication(true);
        track.getSend(1).setIndication(true);
        track.getSend(2).setIndication(true);

        clipLauncher = track.getClipLauncher();
        clipLauncher.addHasContentObserver(getClipObserverFunc(t, 1));
        clipLauncher.addIsPlayingObserver(getClipObserverFunc(t, 2));
        clipLauncher.addIsRecordingObserver(getClipObserverFunc(t, 3));
        clipLauncher.addIsPlaybackQueuedObserver(getClipObserverFunc(t, 4));
        clipLauncher.addIsRecordingQueuedObserver(getClipObserverFunc(t, 5));
        clipLauncher.addIsStopQueuedObserver(getClipObserverFunc(t, 6));
        clipLauncher.setIndication(true);
    }

    tracksBankView.addCanScrollTracksUpObserver(canScrollTracksUpOb);
    tracksBankView.addCanScrollTracksDownObserver(canScrollTracksDownOb);
    tracksBankView.addCanScrollScenesUpObserver(canScrollScenesUpOb);
    tracksBankView.addCanScrollScenesDownObserver(canScrollScenesDownOb);


    masterTrackView.getVolume().addValueObserver(161, masterTrackOb);
    masterTrackView.getVolume().setIndication(true);
    masterTrackView.getPan().setIndication(true);
    userControlBankView.getControl(16).setIndication(true);
}

function exit() {
    for (var t = 0; t < 8; t++) {
        tracksBankView.getChannel(t).getClipLauncher().setIndication(false);
        userControlBankView.getControl(t).setIndication(false);
        userControlBankView.getControl(t + 8).setIndication(false);
      
      //EDIT
      for ( var i = 0; i < 8; i++)
        {
            var p = remoteControls.getParameter(i).getAmount();
            p.setIndication(false);
            p.setLabel("P" + (i + 1));
        }
      
        //DEPRECIATED  for (var m = 0; m < 8; m++) cursorDevice.getCommonParameter(m).setIndication(false);
        tracksBankView.getChannel(t).getVolume().setIndication(false);
        tracksBankView.getChannel(t).getPan().setIndication(false);
        tracksBankView.getChannel(t).getSend(0).setIndication(false);
        tracksBankView.getChannel(t).getSend(1).setIndication(false);
        tracksBankView.getChannel(t).getSend(2).setIndication(false);

        sendMidi(0x80 | t, 0x30, 0x00);
        sendMidi(0x80 | t, 0x31, 0x00);
        sendMidi(0x80 | t, 0x32, 0x00);
        sendMidi(0x80 | t, 0x33, 0x00);
    }
    masterTrackView.getVolume().setIndication(false);
    masterTrackView.getPan().setIndication(false);
    userControlBankView.getControl(16).setIndication(false);

    sendMidi(0x80, 0x50, 0x00);
    for (var scn = 0; scn < 5; scn++)
        for (var tr = 0; tr < 8; tr++)
            sendMidi(0x80 | tr, 0x35 + scn, 0x00);

    noteMode = false;
    overdubMode = false;
    isPlaying = false;
    isRecording = false;
    shiftPressed = false;
    canScrollLeft = canScrollRight = canScrollUp = canScrollDown = false;
    fadersMode = 0;
    selectedTrackIndex = 0;
    clipSize = 4;
    notifications = true;
    clipHasContent = initArray(false, 40);
    clipIsPlaiyng = initArray(false, 40);
    clipIsRecording = initArray(false, 40);
    clipIsQueued = initArray(false, 40);
    trackIsMuted = initArray(false, 8);
    trackIsSoloed = initArray(false, 8);
    trackIsArmed = initArray(false, 8);
    trackExists = initArray(false, 8)
    trackIsGroup = initArray(false, 8);
    trackIsMuted = initArray(false, 8);
    trackIsSoloed = initArray(false, 8);
    trackIsArmed = initArray(false, 8);
    trackExists = initArray(false, 8);

    sendSysex("F0 47 7F 7B 60 00 04 40 08 02 01 F7"); // Set Mode 0
}

function onMidi(status, data1, data2) {

    /////////////////////////////
    // Button without shift
    /////////////////////////////

    if ((status >= 0x80) && (status <= 0x9F) && !shiftPressed) // if it is a button without shift
    {
        if ((status >= 0x90) && (status <= 0x97) && (data1 === 0x30)) // track arm pressed
        {
            tracksBankView.getChannel(status & 0x0F).getArm().toggle();
            return;
        }

        if ((status >= 0x90) && (status <= 0x97) && (data1 === 0x31)) // track solo pressed
        {
            tracksBankView.getChannel(status & 0x0F).getSolo().toggle();
            return;
        }

        if ((status >= 0x90) && (status <= 0x97) && (data1 === 0x32)) // track activator pressed
        {
            tracksBankView.getChannel(status & 0x0F).getMute().toggle();
            return;
        }

        if ((status === 0x90) && (data1 === 0x33)) //Play pressed
        {
            transportView.togglePlay();
            return;
        }

        if ((status === 0x91) && (data1 === 0x33)) //Stop pressed
        {
            transportView.stop();
            sendMidi(0x91, 0x33, 0x7F); // LED on
            return;
        }

        if ((status === 0x81) && (data1 === 0x33)) //Stop released
        {
            sendMidi(0x81, 0x33, 0x00); // LED off
            return;
        }

        if ((status === 0x92) && (data1 === 0x33) && !isRecording) //Record mode pressed
        {
            transportView.record();
            return;
        }
        if ((status === 0x92) && (data1 === 0x33) && isRecording) //Record mode pressed
        {
            transportView.record();
            return;
        }

        if ((status === 0x93) && (data1 === 0x33) && !overdubMode) //Overdub mode pressed
        {
            transportView.setLauncherOverdub(true); //fixed
            return;
        }
        if ((status === 0x93) && (data1 === 0x33) && overdubMode) //Overdub mode pressed
        {
            transportView.setLauncherOverdub(false); //fixed
            return;
        }

        if ((status === 0x94) && (data1 === 0x33)) //Left pressed
        {
            tracksBankView.scrollChannelsUp();
            return;
        }

        if ((status === 0x95) && (data1 === 0x33)) //Right pressed
        {
            tracksBankView.scrollChannelsDown();
            return;
        }

        if ((status === 0x96) && (data1 === 0x33)) //Up pressed
        {
            tracksBankView.scrollScenesUp();
            return;
        }

        if ((status === 0x97) && (data1 === 0x33)) //Down pressed
        {
            tracksBankView.scrollScenesDown();
            return;
        }

        if ((status === 0x90) && (data1 === 0x50) && !noteMode) //Note mode pressed
        { // Switching to note mode now
            for (var scn = 0; scn < 5; scn++)
                for (var tr = 0; tr < 8; tr++)
                    sendMidi(0x80 | tr, 0x35 + scn, 0x00); // clear clip LEDs for note mode

            sendSysex("F0 47 7F 7B 60 00 04 43 08 02 01 F7"); // Set NoteMode
            noteMode = true;
            host.scheduleTask(switchLEDStoNoteMode, null, SLOWPOKE_DELAY); //Let's give APC20 some time to switch mode

            if (notifications) host.showPopupNotification("APC20: Note Mode");
            return;
        }

        if ((status === 0x90) && (data1 === 0x50) && noteMode) //Note mode pressed
        { // Returning to clip mode now
            sendSysex("F0 47 7F 7B 60 00 04 41 08 02 01 F7"); // Set Mode 1
            noteMode = false;
            host.scheduleTask(switchLEDStoClipMode, null, SLOWPOKE_DELAY); //Let's give APC20 some time to switch mode

            if (notifications) host.showPopupNotification("APC20: Clip Mode");
            return;
        }

        if ((status >= 0x90) && (status <= 0x97) && (data1 >= 0x35) && (data1 <= 0x39)) //clip launch pressed
        {
            tracksBankView.getChannel(status & 0x0F).getClipLauncherSlots().launch(data1 - 0x35);
            return;
        }
        if ((status >= 0x90) && (status <= 0x97) && (data1 === 0x34)) //clip stop pressed
        {
            tracksBankView.getChannel(status & 0x0F).getClipLauncherSlots().stop();
            sendMidi(status, data1, 0x7F); // turn LED on
            return;
        }
        if ((status >= 0x80) && (status <= 0x87) && (data1 === 0x34)) //clip stop released
        {
            sendMidi(status, data1, 0x00); // turn LED off
            return;
        }

        if ((status === 0x90) && (data1 >= 0x52) && (data1 <= 0x56)) //scene launch pressed
        {
            tracksBankView.getClipLauncherScenes().launch(data1 - 0x52);
            sendMidi(status, data1, 0x7F); // turn LED on
            return;
        }
        if ((status === 0x80) && (data1 >= 0x52) && (data1 <= 0x56)) //scene launch released
        {
            sendMidi(status, data1, 0x00); // turn LED on
            return;
        }

        if ((status === 0x90) && (data1 === 0x51)) //Shift pressed
        {
            shiftPressed = true;

            for (var tr = 0; tr < 8; tr++) // set tracks arm LEDs in shift mode
                sendMidi((fadersMode === tr) ? (0x90 | tr) : (0x80 | tr), 0x30, (fadersMode === tr) ? 1 : 0);

            return;
        }

    }


    //////////////////////////
    // Shift + Button
    //////////////////////////

    if ((status >= 0x80) && (status <= 0x9F) && shiftPressed) // if it is a button with shift
    {
        if ((status === 0x80) && (data1 === 0x51)) //Shift released
        {
            shiftPressed = false;

            for (var tr = 0; tr < 8; tr++) // restore tracks arm LEDs
                sendMidi(trackIsArmed[tr] ? (0x90 | tr) : (0x80 | tr), 0x30, trackIsArmed[tr] ? 1 : 0);

            return;
        }

        if ((status >= 0x90) && (status <= 0x96) && (data1 === 0x34)) //clip stop pressed
        {
            sendMidi(status, data1, 0x7F); // turn LED on

            switch (status & 0x0F) {
                case 0:
                    {
                        clipSize = 4;
                        if (notifications) host.showPopupNotification("APC20: new clip size = 1 bar");
                        return;
                    }
                case 1:
                    {
                        clipSize = 8;
                        if (notifications) host.showPopupNotification("APC20: new clip size = 2 bars");
                        return;
                    }
                case 2:
                    {
                        clipSize = 16;
                        if (notifications) host.showPopupNotification("APC20: new clip size = 4 bars");
                        return;
                    }
                case 3:
                    {
                        clipSize = 32;
                        if (notifications) host.showPopupNotification("APC20: new clip size = 16 bars");
                        return;
                    }
                case 4:
                    {
                        transportView.toggleWriteClipLauncherAutomation();
                        return;
                    }
                case 5:
                    {
                        transportView.toggleLoop();
                        return;
                    }
                case 6:
                    {
                        transportView.toggleClick();
                        return;
                    }
            }

            return;
        }

        if ((status === 0x90) && (data1 >= 0x52) && (data1 <= 0x56)) //scene launch pressed
        {
            switch (data1 - 0x52) {
                case 0:
                    {
                        tracksBankView.scrollChannelsPageUp();
                        return;
                    }
                case 1:
                    {
                        tracksBankView.scrollChannelsPageDown();
                        return;
                    }
                case 2:
                    {
                        tracksBankView.scrollScenesPageUp();
                        return;
                    }
                case 3:
                    {
                        tracksBankView.scrollScenesPageDown();
                        return;
                    }
                case 4:
                    {
                        notifications = !notifications;
                        return;
                    }
            }

            return;
        }

        if ((status === 0x97) && (data1 === 0x34)) // stop all clips pressed
        {
            tracksBankView.getClipLauncherScenes().stop();
            sendMidi(status, data1, 0x7F); // turn LED on
            return;
        }
        if ((status >= 0x80) && (status <= 0x87) && (data1 === 0x34)) // stop clips released
        {
            sendMidi(status, data1, 0x00); // turn LED off
            return;
        }
        if ((status === 0x80) && (data1 >= 0x52) && (data1 <= 0x56)) //scene launch released
        {
            sendMidi(status, data1, 0x00); // turn LED on
            return;
        }

        if ((status >= 0x90) && (status <= 0x97) && (data1 === 0x30)) // track arm pressed
        {
            //	tracksBankView.getChannel( status & 0x0F ).getArm( ).toggle( );
            fadersMode = status & 0x0F;
            for (var tr = 0; tr < 8; tr++) // reset tracks arm LEDs in shift mode
                sendMidi((fadersMode === tr) ? (0x90 | tr) : (0x80 | tr), 0x30, (fadersMode === tr) ? 1 : 0);

            return;
        }

        if ((status >= 0x90) && (status <= 0x97) && (data1 === 0x33)) //Track selection
        {
            tracksBankView.getChannel(status & 0x0F).select();
            return;
        }
        if ((status === 0x90) && (data1 === 0x50)) //Master track selection
        {
            masterTrackView.select();
        }

        if ((status >= 0x90) && (status <= 0x97) && (data1 >= 0x35) && (data1 <= 0x39)) //clip launch pressed
        {
            if (clipHasContent[(status & 0x0F) + (data1 - 0x35) * 8]) //tr + scn*8
            {
                tracksBankView.getChannel(status & 0x0F).getClipLauncherSlots().select(data1 - 0x35); // select clip
                tracksBankView.getChannel(status & 0x0F).getClipLauncherSlots().showInEditor(data1 - 0x35); //show in editor
            } else { // create clip and select it
                if (trackIsGroup[(status & 0x0F)] == false) {
                    tracksBankView.getChannel(status & 0x0F).getClipLauncherSlots().createEmptyClip(data1 - 0x35, clipSize);
                    tracksBankView.getChannel(status & 0x0F).getClipLauncherSlots().select(data1 - 0x35);
                    tracksBankView.getChannel(status & 0x0F).getClipLauncherSlots().showInEditor(data1 - 0x35); //show in editor
                }
            }

            return;
        }
    }


    //////////////////////////
    // Control messages
    //////////////////////////

    if ((status >= 0xB0) && (status <= 0xBF)) // if it is a control
    {
        //EDIT
     //   if (data1 === 0x2F) // CUE relative data
     //   {

           // userControlBankView.getControl(16).inc((data2 < 0x80) ? data2 : (data2 - 0x80), 128);

            // make it configurable
            // cue is mappable or
            // is used to navigate select devices
            // if (data2 < 0x40) {
            //     cursUp += data2;
            // }
            // if (data2 > 0x40) {
            //     cursDown += data2 - 0x80;
            // }
            // if (cursUp > 15) {
            //     cursUp = 0;
            //     cursorDevice.selectNext();
            // }
            // if (cursDown < -15) {
            //     cursDown = 0;
            //     cursorDevice.selectPrevious();
            // }
        //    return;
       // }

        switch (fadersMode) {
            case 0: // Vol mode
                {
                    if (data1 === 0x07) // vol fader
                    {
                        tracksBankView.getChannel(status & 0x07).getVolume().set(data2, 161); // 161 instead of 128 to limit max vol to 0dB not +6dB
                        return;
                    }
                    if (data1 === 0x0E) // master fader
                    {
                        masterTrackView.getVolume().set(data2, 161); // 161 instead of 128 to limit max vol to 0dB not +6dB
                        return;
                    }
                }
            case 1: // Pan mode
                {
                    if (data1 === 0x07) // vol fader
                    {
                        tracksBankView.getChannel(status & 0x07).getPan().set(data2, 128);
                        return;
                    }
                    if (data1 === 0x0E) // master fader
                    {
                        masterTrackView.getPan().set(data2, 128);
                        return;
                    }
                }
            case 2: // Send A mode
                {
                    if (data1 === 0x07) // vol fader
                    {
                        tracksBankView.getChannel(status & 0x07).getSend(0).set(data2, 128);
                        return;
                    }
                    if (data1 === 0x0E) // master fader
                    {
                        masterTrackView.getVolume().set(data2, 161); // Master is still volume control
                        return;
                    }
                }
            case 3: // Send B mode
                {
                    if (data1 === 0x07) // vol fader
                    {
                        tracksBankView.getChannel(status & 0x07).getSend(1).set(data2, 128);
                        return;
                    }
                    if (data1 === 0x0E) // master fader
                    {
                        masterTrackView.getVolume().set(data2, 161); // Master is still volume control
                        return;
                    }
                }
            case 4: // Send C mode
                {
                    if (data1 === 0x07) // vol fader
                    {
                        tracksBankView.getChannel(status & 0x07).getSend(2).set(data2, 128);
                        return;
                    }
                    if (data1 === 0x0E) // master fader
                    {
                        masterTrackView.getVolume().set(data2, 161); // Master is still volume control
                        return;
                    }
                }
            case 5: // User1 mode
                {
                    if (data1 === 0x07) // vol fader
                    {
                        userControlBankView.getControl(status & 0x07).set(data2, 128);
                        return;
                    }
                    if (data1 === 0x0E) // master fader
                    {
                        masterTrackView.getVolume().set(data2, 161); // Master is still volume control
                        return;
                    }
                }
            case 6: // User2 mode
                {
                    if (data1 === 0x07) // vol fader
                    {
                        userControlBankView.getControl(8 + (status & 0x07)).set(data2, 128);
                        return;
                    }
                    if (data1 === 0x0E) // master fader
                    {
                        masterTrackView.getVolume().set(data2, 161); // Master is still volume control
                        return;
                    }
                }
            case 7: // User3 mode
                {
                    if (data1 === 0x07) // vol fader
                    {
                        //EDIT

                        remoteControls.getParameter((status & 0x07)).getAmount().value().set(data2, 128);
                        //EDIT  cursorDevice.getCommonParameter((status & 0x07)).set(data2, 128);
                        return;
                    }
                    if (data1 === 0x0E) // master fader
                    {
                        masterTrackView.getVolume().set(data2, 161); // Master is still volume control
                        return;
                    }
                }
            default:
                break;
        }
    }

    //	printMidi( status, data1, data2 ); //some unhandled messages
}

function onSysex(data) {
    //	printSysex( data );
    return;
}

function isPlayingOb(state) {
    isPlaying = state;
    if (isPlaying) sendMidi(0x90, 0x33, 0x7F); // turn LED on
    if (!isPlaying) sendMidi(0x80, 0x33, 0x00); // turn LED off
}

function isRecordingOb(state) {
    isRecording = state;
    if (isRecording) sendMidi(0x92, 0x33, 0x7F); // turn LED on
    if (!isRecording) sendMidi(0x82, 0x33, 0x00); // turn LED off
}

function launcherOverdubOb(state) {
    overdubMode = state;
    if (overdubMode) sendMidi(0x93, 0x33, 0x7F); // turn LED on
    if (!overdubMode) sendMidi(0x83, 0x33, 0x00); // turn LED off
}

function getTrackObFunc(track, property) {
    return function(value) {
        switch (property) {
            case 1: // Track vol changed
                {
                    //	sendMidi( 0xB0 | track, 0x07, (value <= 127) ? value : 127 );
                    return;
                }
            case 2: // Track mute changed
                {
                    trackIsMuted[track] = value;
                    if (trackExists[track])
                        sendMidi(value ? (0x80 | track) : (0x90 | track), 0x32, value ? 0 : 1);
                    return;
                }
            case 3: // Track solo changed
                {
                    trackIsSoloed[track] = value;
                    sendMidi(value ? (0x90 | track) : (0x80 | track), 0x31, value ? 1 : 0);
                    return;
                }
            case 4: // Track arm changed
                {
                    trackIsArmed[track] = value;
                    if (!shiftPressed)
                        sendMidi(value ? (0x90 | track) : (0x80 | track), 0x30, value ? 1 : 0);
                    return;
                }
            case 5: // Track exist changed
                {
                    trackExists[track] = value;
                    if (!trackExists[track])
                        sendMidi(0x80 | track, 0x32, 0x00);
                    return;
                }
            case 6: // Track is selected changed
                {
                    if (value)
                        selectedTrackIndex = track;
                    return;
                }
            case 7: // Track is group
                {
                    trackIsGroup[track] = value;
                }
        }

    }
}

function getClipObserverFunc(track, state) {
    return function(scene, value) {
        switch (state) {
            case 1: // has content
                {
                    // println("Track : " + track + ", Scene : " + scene + " has content: " + value);
                    clipHasContent[track + scene * 8] = value;
                    if (value && !clipIsRecording[track + scene * 8]) {
                        sendMidi(0x90 | track, 0x35 + scene, 0x05); //yellow
                        return;
                    }
                    if (!value) // if empty
                    {
                        sendMidi(0x80 | track, 0x35 + scene, 0x00); //off
                        return;
                    }
                    return;
                }
            case 2: // is playing
                {
                    // println("Track : " + track + ", Scene : " + scene + "is playing: " + value);
                    clipIsPlaiyng[track + scene * 8] = value;
                    if (value) {
                        sendMidi(0x90 | track, 0x35 + scene, 0x01); //green
                        return;
                    }
                    if (!value && clipHasContent[track + scene * 8] && clipIsQueued[track + scene * 8]) // if queued
                    {
                        sendMidi(0x90 | track, 0x35 + scene, 0x02); //blink green
                        return;
                    }
                    if (!value && clipHasContent[track + scene * 8] && !clipIsQueued[track + scene * 8]) // if stopped
                    {
                        sendMidi(0x90 | track, 0x35 + scene, 0x05); //back to yellow
                        return;
                    } else
                        sendMidi(0x80 | track, 0x35 + scene, 0x00); //off
                    return;
                }
            case 3: // is recording
                {
                    // println("Track : " + track + ", Scene : " + scene + " is recording: " + value);
                    clipIsRecording[track + scene * 8] = value;
                    if (value) {
                        sendMidi(0x90 | track, 0x35 + scene, 0x03); //red
                        return;
                    }
                    if (!value && clipHasContent[track + scene * 8] && !clipIsPlaiyng[track + scene * 8]) // if stopped
                    {
                        sendMidi(0x90 | track, 0x35 + scene, 0x05); //back to yellow
                        return;
                    }
                    if (!value && clipHasContent[track + scene * 8] && clipIsPlaiyng[track + scene * 8]) // if playing
                    {
                        sendMidi(0x90 | track, 0x35 + scene, 0x01); //back to green
                        return;
                    } else
                        sendMidi(0x80 | track, 0x35 + scene, 0x00); //off
                    return;
                }
            case 4: // is playback queued
                {
                    // println("Track : " + track + ", Scene : " + scene + " playback queued: " + value);
                    clipIsQueued[track + scene * 8] = value;
                    if (value) {
                        sendMidi(0x90 | track, 0x35 + scene, 0x02); //blink green
                        return;
                    }
                    if (!value && clipHasContent[track + scene * 8] && !clipIsPlaiyng[track + scene * 8]) // if stopped
                    {
                        sendMidi(0x90 | track, 0x35 + scene, 0x05); //back to yellow
                        return; //do nothing
                    }
                    if (!value && clipIsPlaiyng[track + scene * 8]) // if playing
                    {
                        sendMidi(0x90 | track, 0x35 + scene, 0x01); //back to green
                        return; //do nothing
                    }
                    return;
                }
            case 5: // is record queued
                {
                    // println("Track : " + track + ", Scene : " + scene + " record queued: " + value);
                    clipIsQueued[track + scene * 8] = value;
                    if (value) {
                        sendMidi(0x90 | track, 0x35 + scene, 0x04); //blink red
                        return;
                    }
                    if (!value && clipHasContent[track + scene * 8] && !clipIsPlaiyng[track + scene * 8]) // if stopped
                    {
                        sendMidi(0x90 | track, 0x35 + scene, 0x05); //back to yellow
                        return; //do nothing
                    }
                    if (!value && clipIsPlaiyng[track + scene * 8]) // if playing
                    {
                        sendMidi(0x90 | track, 0x35 + scene, 0x01); //back to green
                        return; //do nothing
                    }
                    return;
                }
            case 6: // is stop queued
                {
                    // println("Track : " + track + ", Scene : " + scene + " stop queued: " + value);
                    clipIsQueued[track + scene * 8] = value;
                    if (value) {
                        sendMidi(0x90 | track, 0x35 + scene, 0x06); //blink yellow
                        return;
                    }
                    if (!value) // if stopped
                    {
                        sendMidi(0x80 | track, 0x35 + scene, 0x00); //off
                        return; //do nothing
                    }
                    return;
                }
            default:
                return;
        }

    }
}

function masterTrackOb(value) {
    // sendMidi(0xB0, 0x0E, (value <= 127) ? value : 127);  //do not update volume
    return;
}

function canScrollTracksUpOb(state) {
    canScrollLeft = state;
    if (canScrollLeft) sendMidi(0x94, 0x33, 0x7F); // turn LED on
    if (!canScrollLeft) sendMidi(0x84, 0x33, 0x00); // turn LED off
}

function canScrollTracksDownOb(state) {
    canScrollRight = state;
    if (canScrollRight) sendMidi(0x95, 0x33, 0x7F); // turn LED on
    if (!canScrollRight) sendMidi(0x85, 0x33, 0x00); // turn LED off
}

function canScrollScenesUpOb(state) {
    canScrollUp = state;
    if (canScrollUp) sendMidi(0x96, 0x33, 0x7F); // turn LED on
    if (!canScrollUp) sendMidi(0x86, 0x33, 0x00); // turn LED off
}

function canScrollScenesDownOb(state) {
    canScrollDown = state;
    if (canScrollDown) sendMidi(0x97, 0x33, 0x7F); // turn LED on
    if (!canScrollDown) sendMidi(0x87, 0x33, 0x00); // turn LED off
}
