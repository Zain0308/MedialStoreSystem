import { Component } from '@angular/core';

@Component({
  selector: 'app-forbidden-page',
  template: '<section class="panel page-content"><h2>Access denied</h2><p>Your account does not have permission to open this section. Ask a store administrator if you need access.</p></section>',
})
export class ForbiddenPage {}
