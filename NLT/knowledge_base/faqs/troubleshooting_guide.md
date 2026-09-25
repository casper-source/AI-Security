# Technical Troubleshooting Guide - NodeLine Tech

## Quick Diagnostic Steps

### Universal Troubleshooting Checklist
Before contacting support, try these basic steps for any cable issue:

1. **Check Physical Connections**
   - Ensure both ends are fully inserted
   - Try inserting/removing cables several times
   - Check for bent or damaged connectors
   - Verify you're using the correct ports

2. **Test with Known Good Components**
   - Try cable with different devices
   - Test devices with known working cables
   - Use different ports on same device
   - Test on different power sources

3. **Power Cycle Everything**
   - Turn off all connected devices
   - Unplug power for 30 seconds
   - Reconnect power and turn on display first
   - Turn on source device last

4. **Check Settings**
   - Verify input/output settings on devices
   - Check resolution and refresh rate settings
   - Ensure correct mode selected (charging, data, video)
   - Update device drivers if on computer

## USB Cable Troubleshooting

### USB-C Issues

#### Device Not Charging
**Symptoms**: No charging indicator, slow charging, intermittent charging

**Diagnostic Steps**:
1. **Power Delivery Check**:
   - Verify charger wattage matches device requirements
   - Check if cable supports required power delivery
   - Try original charger if available
   - Test with lower-power charger to isolate issue

2. **Connection Verification**:
   - Clean USB-C ports with compressed air
   - Try flipping cable (both orientations)
   - Check for lint or debris in ports
   - Ensure cable isn't loose in port

3. **Device Settings**:
   - Check charging settings in device menu
   - Disable fast charging temporarily
   - Try charging with device powered off
   - Reset charging settings to default

**Solutions**:
- Use certified USB-C charger with adequate wattage
- Replace cable if power delivery insufficient
- Clean ports regularly to maintain connection
- Contact support if device won't charge with multiple cables

#### Data Transfer Problems
**Symptoms**: Device not recognized, slow transfer speeds, connection drops

**Diagnostic Steps**:
1. **USB Mode Selection**:
   - On Android: Select "File Transfer" or "MTP" mode
   - On iOS: Trust the computer when prompted
   - Check for "USB debugging" mode (Android)
   - Try different USB connection modes

2. **Driver Issues (Windows)**:
   - Update USB drivers in Device Manager
   - Try different USB ports (USB 3.0 vs 2.0)
   - Restart Windows with device connected
   - Install manufacturer's USB drivers

3. **Cable Specification Check**:
   - Verify cable supports data transfer (not just charging)
   - Check USB version compatibility (2.0, 3.0, 3.1, 3.2)
   - Ensure cable length appropriate for data speeds
   - Test with shorter cable if available

**Solutions**:
- Use data-capable USB-C cable (not charging-only)
- Install proper device drivers
- Use USB 3.0+ ports for fastest speeds
- Keep cable length under 6 feet for optimal performance

### USB-A Issues

#### Device Not Recognized
**Symptoms**: Computer doesn't detect connected device

**Diagnostic Steps**:
1. **Port Testing**:
   - Try all available USB ports
   - Test both USB 2.0 and 3.0 ports
   - Use front and back ports on desktop
   - Test with USB hub if available

2. **Power Issues**:
   - Check if device powers on when connected
   - Try powered USB hub for high-power devices
   - Connect device to wall charger first
   - Check USB port power settings in Windows

3. **Driver Troubleshooting**:
   - Open Device Manager and look for unknown devices
   - Update or reinstall USB drivers
   - Try on different computer to isolate issue
   - Check manufacturer website for drivers

**Solutions**:
- Use powered USB hub for high-current devices
- Update USB controllers in Device Manager
- Try direct connection without USB hub
- Replace cable if multiple computers don't recognize device

## HDMI Troubleshooting

### No Video Signal

#### Black Screen Issues
**Symptoms**: Display shows "No Signal" or remains black

**Diagnostic Steps**:
1. **Basic Connection Check**:
   - Verify cable connected to correct HDMI input
   - Try different HDMI ports on display
   - Check if HDMI input is selected on TV/monitor
   - Ensure both devices are powered on

2. **Resolution Compatibility**:
   - Start with lower resolution (1080p)
   - Check maximum resolution supported by display
   - Try different refresh rates (60Hz, 30Hz)
   - Test with safe mode or basic video settings

3. **HDCP Handshake Issues**:
   - Power off both devices for 30 seconds
   - Turn on display first, then source
   - Try disabling HDCP on source device
   - Test with different HDMI cable

**Solutions**:
- Use HDMI 2.1 cable for 4K@120Hz or 8K
- Enable "Enhanced HDMI" mode on TV
- Update graphics drivers on computer
- Try component or composite video as alternative

#### Intermittent Signal Loss
**Symptoms**: Picture cuts out periodically, flickering, snow

**Diagnostic Steps**:
1. **Cable Integrity**:
   - Inspect cable for physical damage
   - Try different cable to isolate issue
   - Check cable length (shorter is better)
   - Ensure cable not bent sharply

2. **Bandwidth Issues**:
   - Reduce resolution or refresh rate
   - Disable HDR temporarily
   - Try HDMI 2.0 instead of 2.1 mode
   - Check if cable supports required bandwidth

3. **Interference Check**:
   - Move cable away from power cables
   - Check for nearby electromagnetic interference
   - Try different HDMI port
   - Test in different location

**Solutions**:
- Use higher quality cable for long runs
- Add ferrite cores to reduce interference
- Use active HDMI cable for distances over 15 feet
- Replace cable if intermittent connection continues

### Audio Issues

#### No Audio Through HDMI
**Symptoms**: Video works but no audio from display or speakers

**Diagnostic Steps**:
1. **Audio Output Settings**:
   - Set HDMI as default audio device
   - Check audio format settings (PCM vs Bitstream)
   - Verify audio isn't muted on source device
   - Try different audio format (stereo vs surround)

2. **Display Audio Settings**:
   - Check TV/monitor audio settings
   - Verify internal speakers are enabled
   - Test with headphones connected to display
   - Check audio output selection on TV

3. **Driver Issues**:
   - Update audio drivers on computer
   - Reinstall HDMI audio drivers
   - Check Windows Sound control panel
   - Try disabling other audio devices

**Solutions**:
- Enable HDMI audio in device settings
- Use PCM audio format for compatibility
- Update graphics and audio drivers
- Try different HDMI port on display

## Network Cable Troubleshooting

### Ethernet Connection Issues

#### No Network Connection
**Symptoms**: No internet, network adapter shows disconnected

**Diagnostic Steps**:
1. **Link Status Check**:
   - Look for link lights on network ports
   - Check cable continuity with tester
   - Try different ethernet ports
   - Test cable with different devices

2. **Cable Specification**:
   - Verify cable category (Cat5e, Cat6, Cat6a)
   - Check cable length (maximum 328 feet)
   - Ensure straight-through cable (not crossover)
   - Test with known good cable

3. **Network Settings**:
   - Check IP address configuration
   - Try automatic IP settings (DHCP)
   - Reset network adapter
   - Update network drivers

**Solutions**:
- Use Cat6 cable for Gigabit speeds
- Replace cable if no link lights
- Check network adapter settings
- Contact IT support for network configuration

#### Slow Network Speeds
**Symptoms**: Connection works but speeds slower than expected

**Diagnostic Steps**:
1. **Speed Testing**:
   - Run speed test from multiple sources
   - Test wired vs wireless speeds
   - Check speeds at different times
   - Compare with ISP advertised speeds

2. **Cable Quality**:
   - Verify cable supports required speed
   - Check for interference from power cables
   - Test with shorter cable
   - Ensure cable not damaged or kinked

3. **Network Configuration**:
   - Check duplex settings (full vs half)
   - Verify network adapter speed settings
   - Test direct connection to modem
   - Check for network congestion

**Solutions**:
- Use Cat6a cable for 10 Gigabit speeds
- Keep network cables away from power lines
- Update network drivers and firmware
- Check with ISP if speeds consistently low

## Audio Cable Troubleshooting

### 3.5mm Audio Issues

#### No Audio Output
**Symptoms**: No sound from headphones or speakers

**Diagnostic Steps**:
1. **Connection Check**:
   - Ensure plug fully inserted
   - Try different audio jacks
   - Check for loose connections
   - Test with different devices

2. **Device Settings**:
   - Check audio output selection
   - Verify volume levels not muted
   - Try different audio sources
   - Test with built-in speakers

3. **Cable Testing**:
   - Try different audio cable
   - Check for cable damage
   - Test with different headphones/speakers
   - Verify cable compatibility (TRRS vs TRS)

**Solutions**:
- Clean audio jacks with compressed air
- Use appropriate cable type for device
- Check audio driver settings
- Replace cable if testing confirms failure

## Power Cable Troubleshooting

### AC Power Issues

#### Device Not Powering On
**Symptoms**: No power indicator, device completely dead

**Diagnostic Steps**:
1. **Power Source Check**:
   - Verify outlet has power
   - Try different wall outlet
   - Check circuit breaker/fuse
   - Test with different devices

2. **Cable Inspection**:
   - Look for obvious cable damage
   - Check connector for looseness
   - Verify correct voltage/amperage rating
   - Test with different power cable if available

3. **Device Testing**:
   - Try powering device with battery if available
   - Check power button functionality
   - Look for power indicator lights
   - Try different power adapter if compatible

**Solutions**:
- Replace power cable if damaged
- Use proper voltage/amperage adapter
- Check device fuse if user replaceable
- Contact device manufacturer for internal issues

## Advanced Diagnostics

### Cable Testing Equipment
For professional troubleshooting:

1. **Cable Testers**:
   - Continuity testers for basic connectivity
   - Network cable testers for ethernet
   - HDMI signal analyzers for video cables
   - USB testers for power and data

2. **Multimeters**:
   - Voltage testing for power cables
   - Continuity testing for all cable types
   - Resistance measurements
   - Current draw testing

3. **Oscilloscopes**:
   - Signal quality analysis
   - Timing measurements
   - Noise and interference detection
   - High-speed signal integrity

### Environmental Factors
Consider these environmental impacts:

1. **Temperature**:
   - Extreme heat can damage cable insulation
   - Cold temperatures can make cables stiff
   - Thermal cycling can cause connector expansion

2. **Humidity**:
   - High humidity can cause corrosion
   - Moisture can cause short circuits
   - Condensation in connectors

3. **Physical Stress**:
   - Repeated bending at connection points
   - Weight stress on connectors
   - Vibration in mobile applications

## When to Contact Support

### Warranty Claims
Contact NodeLine Tech support if:
- Troubleshooting steps don't resolve issue
- Cable fails within warranty period
- Multiple cables have same problem
- Device damage suspected from cable

### Technical Support
We can help with:
- Advanced troubleshooting guidance
- Compatibility verification
- Replacement recommendations
- Custom cable solutions

### Contact Methods
- **AI Chat**: Instant support at nodelinetech.com
- **Phone**: 1-800-NLT-HELP
- **Email**: tech@nodelinetech.com
- **Hours**: Monday-Friday 8 AM - 8 PM EST

---

*Troubleshooting guide version 2.3 - Updated September 2024*
*For video troubleshooting guides, visit nodelinetech.com/support*
