I want to make a application that lets us bind a 1 to 1 keyboard rebind for MS remote desktop.

Main issue we want to fix, is that remoting from a Mac to a Windows machine often results in certain keys not functioning as expected due to differences in keyboard layouts and key mappings.

This application will allow users to create custom key bindings that will translate their Mac keyboard inputs into the correct Windows key inputs when using Microsoft Remote Desktop.

I'm thinking this would be fine to run either on the client side (Mac) or the server side (Windows). I'm a bit unsure what you think would be the best approach.  So i would like to ultrathink about this so we can find out the best solution.

I think for the early versions we might want to go with something that is open to be ran both places. Maybe as a platform-independent application that can be installed on both Mac and Windows. This way, users can choose where they want to run the application based on their preferences and needs.

Then we can just attempt both and see what works best in practice.


But i do suspect running on the server is best as it would allow all platforms to benefit from the same key mapping without requiring each client to install the application.  for example a tablet user or a Linux user connecting to the Windows machine would also benefit from the same key mapping without needing to install anything on their end.

But also having on client might allow us to rebind some keys like command + w.

I'm thinking This would be either way a service that runs in the background, intercepting keyboard inputs and translating them according to the user-defined mappings.

It should see that the active window is the remote desktop session and only then apply the key remapping. This way, it won't interfere with local applications or other remote sessions. Or in server mode, check that we are actually in a remote desktop, maybe try to extract client information to ensure we only remap selected devices.

UI wise i'm thinking we might want it to live in taskbar. then when we open it from there, we get a UI that allows us to define our key mappings. This is probably done best by recoding input and then selecting output keys from a dropdown or something similar. We could also allow users to import/export their key mapping configurations for easy sharing and backup.

We should track clients/servers and suggest to bind them to their specific configurations. For example, if a user has multiple remote desktop connections, they can have different key mappings for each connection. The application could remember these settings and automatically apply the correct mapping based on the active session. Add also a option for just mapping to all sessions if the user prefers a universal mapping.

Look wise it should be modern and minimalistic, with a focus on usability. We want users to be able to quickly set up their key mappings without getting bogged down in complex settings or configurations.

I want you to create a design prompt.md that i can take to claude design and get a nice looking UI.

We should probably have some debug mode where we notify on the rebinds being triggered

I am thinking this would be mostly targeting per key, but we might need to consider combinations as well, like command + w or control + alt + delete. The application should allow users to define both single key mappings and combination key mappings. As some keys might not be sent or keybinded.