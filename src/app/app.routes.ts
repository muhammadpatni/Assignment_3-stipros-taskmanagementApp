import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Signin } from './pages/signin/signin';
import { authGuard } from './guards/auth-guard';
import { Dashboard } from './pages/dashboard/dashboard';
import { Forgotpassword } from './pages/forgotpassword/forgotpassword';

export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', component: Login },
    { path: 'forgotpassword', component: Forgotpassword },
    { path: 'register', component: Signin },
    { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
    { path: '**', redirectTo: 'login' }
];

